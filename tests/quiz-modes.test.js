import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesSpelling,
  createQuizRun,
  submitQuizAnswer,
  advanceQuiz,
  restoreQuizRun,
  recordPractice,
  completeQuiz,
  questionCounts,
} from '../src/lib/quiz.js';
import { emptyState } from '../src/lib/storage.js';
import {
  createSpeechController,
  selectEnglishVoice,
  speechAvailable,
} from '../src/services/speech.js';

const words = [
  { id: 'algorithm', word: 'algorithm', translation: '演算法' },
  { id: 'dynamic programming', word: 'dynamic programming', translation: '動態規劃' },
  { id: 'color', word: 'color', translation: '顏色' },
];
test('spelling normalizes case, Unicode compatibility, and repeated whitespace without fuzzy synonyms', () => {
  assert.equal(matchesSpelling('  ALGORITHM  ', 'algorithm'), true);
  assert.equal(matchesSpelling('ＤＹＮＡＭＩＣ   programming', 'dynamic programming'), true);
  assert.equal(matchesSpelling('dynamic\t programming', 'dynamic programming'), true);
  assert.equal(matchesSpelling('programming', 'dynamic programming'), false);
  assert.equal(matchesSpelling('algorithmic', 'algorithm'), false);
  assert.equal(matchesSpelling('colour', 'color'), false);
  assert.equal(matchesSpelling('colour', 'color', ['colour']), true);
  assert.equal(matchesSpelling('blue', 'color', ['colour']), false);
});
test('question counts only offer supported sizes, including an empty and small dictionary', () => {
  assert.deepEqual(questionCounts(0), []);
  assert.deepEqual(questionCounts(3), ['all']);
  assert.deepEqual(questionCounts(10), [5, 10, 'all']);
  assert.deepEqual(questionCounts(23), [5, 10, 20, 'all']);
});
test('all quiz types have unique questions and optional deterministic randomization', () => {
  for (const type of ['multiple', 'spelling', 'listening']) {
    const ordered = createQuizRun([...words, ...words], {
      type,
      count: 'all',
      randomized: false,
      id: 'run',
    });
    assert.deepEqual(
      ordered.questions.map((q) => q.id),
      words.map((w) => w.id),
    );
    const random = createQuizRun(words, { type, count: 2, random: () => 0, id: 'random' });
    assert.equal(random.questions.length, 2);
    assert.notEqual(random.questions[0].id, words[0].id);
  }
  assert.equal(createQuizRun([], { count: 'all' }).done, true);
});
test('spelling submission and advancement reject rapid duplicate scoring', () => {
  let run = createQuizRun(words, { type: 'spelling', count: 2, randomized: false, id: 'fixed' });
  const first = submitQuizAnswer(run, ' ALGORITHM ');
  assert.equal(first.score, 1);
  assert.equal(submitQuizAnswer(first, 'algorithm'), first);
  run = advanceQuiz(first);
  assert.equal(run.index, 1);
  assert.equal(advanceQuiz(run), run);
  run = submitQuizAnswer(run, 'programming');
  assert.equal(run.score, 1);
  assert.equal(run.answers[1].correct, false);
  run = advanceQuiz(run);
  assert.equal(run.done, true);
  assert.equal(advanceQuiz(run), run);
});
test('listening uses the same strict whole-term validation and accepts only configured alternatives', () => {
  let run = createQuizRun(words.slice(2), {
    type: 'listening',
    count: 'all',
    alternatives: { color: ['colour'] },
    id: 'listen',
  });
  assert.equal(run.answers.length, 0);
  run = submitQuizAnswer(run, 'COLOUR');
  assert.equal(run.score, 1);
});
test('quiz snapshots restore answered questions without scoring again and reject corrupted snapshots', () => {
  const run = submitQuizAnswer(
    createQuizRun(words, { type: 'spelling', count: 3, randomized: false, id: 'restore' }),
    'algorithm',
  );
  const restored = restoreQuizRun(JSON.parse(JSON.stringify(run)), words);
  assert.equal(restored.score, 1);
  assert.equal(submitQuizAnswer(restored, 'algorithm'), restored);
  assert.equal(restoreQuizRun({ ...run, index: 100 }, words), null);
  assert.equal(
    restoreQuizRun({ ...run, questions: [...run.questions, run.questions[0]] }, words),
    null,
  );
  assert.equal(
    restoreQuizRun({ ...run, answers: [{ ...run.answers[0], correct: false }] }, words),
    null,
  );
  assert.equal(restoreQuizRun(run, []), null);
  const multiple = createQuizRun(words, { type: 'multiple' });
  multiple.questions[0].options = [{}, multiple.questions[0].translation];
  assert.equal(restoreQuizRun(multiple, words), null);
});
test('practice records are independent of SRS and a repeated attempt is recorded once', () => {
  const original = emptyState();
  const run = submitQuizAnswer(
    createQuizRun(words, { type: 'spelling', count: 1, randomized: false, id: 'practice' }),
    'wrong',
  );
  const next = recordPractice(original, run.answers[0]);
  assert.equal(next.practice.algorithm.attempts, 1);
  assert.equal(next.practice.algorithm.needsPractice, true);
  assert.deepEqual(next.srs, original.srs);
  assert.deepEqual(next.progress, original.progress);
  assert.equal(recordPractice(next, run.answers[0]), next);
  assert.equal(next.practice.algorithm.correct, 0);
});
test('completed quiz history contains actual results and is idempotent after refresh', () => {
  let run = createQuizRun(words, { type: 'spelling', count: 1, randomized: false, id: 'history' });
  assert.equal(completeQuiz(emptyState(), run).quizHistory.length, 0);
  run = advanceQuiz(submitQuizAnswer(run, 'algorithm'));
  const result = completeQuiz(emptyState(), run);
  assert.equal(result.quizHistory.length, 1);
  assert.equal(result.quizHistory[0].score, 1);
  assert.equal(result.quizHistory[0].total, 1);
  assert.equal(completeQuiz(result, JSON.parse(JSON.stringify(run))), result);
});
function mockSpeech(voices = []) {
  const utterances = [];
  let cancellations = 0;
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  return {
    scope: {
      SpeechSynthesisUtterance: Utterance,
      speechSynthesis: {
        getVoices: () => voices,
        cancel: () => {
          cancellations++;
        },
        speak: (utterance) => {
          utterances.push(utterance);
          utterance.onstart();
        },
      },
    },
    utterances,
    cancellations: () => cancellations,
  };
}
test('English voice selection prefers en-US and gracefully uses browser default when no voice exists', () => {
  const voices = [{ lang: 'zh-TW' }, { lang: 'en-GB' }, { lang: 'en-US' }];
  assert.equal(selectEnglishVoice(voices), voices[2]);
  assert.equal(selectEnglishVoice([]), null);
  const mock = mockSpeech();
  const statuses = [];
  const controller = createSpeechController({ scope: mock.scope });
  assert.equal(
    controller.play('algorithm', { rate: 0.65, onStatus: (s) => statuses.push(s) }),
    true,
  );
  assert.equal(mock.utterances[0].rate, 0.65);
  assert.equal(mock.utterances[0].voice, undefined);
  assert.ok(statuses.some((s) => s.includes('預設')));
  controller.cancel();
});
test('listening fallback handles unsupported browsers without creating any answer', () => {
  const errors = [];
  const controller = createSpeechController({ scope: {} });
  assert.equal(speechAvailable({}), false);
  assert.equal(controller.play('algorithm', { onError: (s) => errors.push(s) }), false);
  assert.match(errors[0], /不支援/);
  const run = createQuizRun(words, { type: 'listening' });
  assert.equal(run.answers.length, 0);
  assert.equal(run.score, 0);
});
test('speech replay/cancellation ignores stale errors and exposes current audio errors', () => {
  const mock = mockSpeech([{ lang: 'en-US' }]);
  const errors = [];
  const controller = createSpeechController({ scope: mock.scope });
  controller.play('first', { onError: (s) => errors.push(s) });
  const first = mock.utterances[0];
  controller.play('second', { onError: (s) => errors.push(s) });
  first.onerror({ error: 'interrupted' });
  assert.equal(errors.length, 0);
  assert.ok(mock.cancellations() >= 2);
  mock.utterances[1].onerror({ error: 'synthesis-failed' });
  assert.equal(errors.length, 1);
  controller.cancel();
});
test('speech that never starts times out with an actionable message', async () => {
  const mock = mockSpeech();
  mock.scope.speechSynthesis.speak = () => {};
  const errors = [];
  const controller = createSpeechController({ scope: mock.scope, startTimeoutMs: 10 });
  controller.play('algorithm', { onError: (s) => errors.push(s) });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.match(errors[0], /尚未開始/);
  controller.cancel();
});
