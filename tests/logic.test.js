import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeVocabulary, parseImport, shuffle } from '../src/lib/vocabulary.js';
import { createQuiz, quizAccuracy } from '../src/lib/quiz.js';
import {
  createSession,
  localDate,
  prioritize,
  rateSession,
  rateWord,
  reconcileSession,
} from '../src/lib/learning.js';
import { emptyState, loadState, saveState, STORAGE_KEY } from '../src/lib/storage.js';

const defaults = JSON.parse(readFileSync(new URL('../vocabularies.json', import.meta.url), 'utf8'));
const words = mergeVocabulary(defaults);

test('all original vocabulary remains unchanged when custom words are merged', () => {
  const original = JSON.stringify(defaults);
  const result = mergeVocabulary(defaults, [
    { word: 'ALGORITHM', translation: '覆寫' },
    { word: 'apple', translation: '蘋果' },
  ]);
  assert.equal(words.length, 23);
  assert.equal(result.length, words.length + 1);
  assert.equal(result.find((word) => word.id === 'algorithm').translation, defaults.algorithm);
  assert.equal(JSON.stringify(defaults), original);
  for (const [word, translation] of Object.entries(defaults))
    assert.ok(result.some((item) => item.word === word && item.translation === translation));
});

test('UTF-8 imports handle blank lines, phrases, CRLF, duplicates, and precise errors', () => {
  const result = parseImport(
    '\uFEFFapple,蘋果\r\n\r\ngive up，放棄\nAPPLE,青蘋果\nalgorithm,演算法\ninvalid\n,沒有英文\nno translation,\nword\t字詞\ncomma,翻譯,包含逗號',
    words,
  );
  assert.deepEqual(
    result.words.map((item) => item.word),
    ['apple', 'give up', 'word', 'comma'],
  );
  assert.equal(result.words[3].translation, '翻譯,包含逗號');
  assert.equal(result.duplicates, 2);
  assert.deepEqual(
    result.errors.map((error) => error.line),
    [6, 7, 8],
  );
  assert.equal(parseImport('  \n\n', words).words.length, 0);
});

test('shuffle never mutates the source vocabulary', () => {
  const input = [1, 2, 3, 4];
  assert.deepEqual(
    shuffle(input, () => 0),
    [2, 3, 4, 1],
  );
  assert.deepEqual(input, [1, 2, 3, 4]);
});

test('10-question quizzes have unique questions and four unique valid options', () => {
  for (let round = 0; round < 30; round += 1) {
    const quiz = createQuiz(words);
    assert.equal(quiz.length, 10);
    assert.equal(new Set(quiz.map((item) => item.id)).size, 10);
    for (const question of quiz) {
      assert.equal(question.options.length, 4);
      assert.equal(new Set(question.options).size, 4);
      assert.ok(question.options.includes(question.translation));
      assert.ok(
        question.options.every((option) => words.some((word) => word.translation === option)),
      );
    }
  }
});

test('quiz gracefully handles zero, one, two, and duplicate-translation dictionaries', () => {
  assert.deepEqual(createQuiz([]), []);
  assert.equal(createQuiz(words.slice(0, 1))[0].options.length, 1);
  assert.equal(createQuiz(words.slice(0, 2)).length, 2);
  assert.equal(createQuiz(words.slice(0, 2))[0].options.length, 2);
  assert.equal(
    createQuiz([
      { id: 'a', translation: '相同' },
      { id: 'b', translation: '相同' },
    ])[0].options.length,
    1,
  );
  assert.equal(quizAccuracy(7, 10), 70);
  assert.equal(quizAccuracy(0, 0), 0);
  assert.equal(quizAccuracy(2, 3), 67);
});

test('forgotten words are prioritized and input progress is immutable', () => {
  let progress = rateWord({}, words[3].id, 'review');
  progress = rateWord(progress, words[4].id, 'review');
  progress = rateWord(progress, words[4].id, 'review');
  assert.deepEqual(
    prioritize(words, progress)
      .slice(0, 2)
      .map((word) => word.id),
    [words[4].id, words[3].id],
  );
  const next = rateWord(progress, words[4].id, 'known');
  assert.equal(progress[words[4].id].status, 'review');
  assert.equal(next[words[4].id].forgotten, 2);
  assert.equal(next[words[4].id].seen, 3);
  assert.equal(prioritize(words, next)[0].id, words[3].id);
});

test('rating advances to unstudied cards, wraps over navigation, and completes once', () => {
  let session = createSession(words.slice(0, 3));
  session = { ...session, index: 2 };
  session = rateSession(session, session.ids[2], 'known');
  assert.equal(session.index, 0);
  session = rateSession(session, session.ids[0], 'review');
  assert.equal(session.index, 1);
  session = rateSession(session, session.ids[1], 'known');
  assert.equal(session.complete, true);
  assert.equal(Object.keys(session.ratings).length, 3);
});

test('session survives refresh, new imports reopen completion, and clearing removes obsolete ids', () => {
  let session = createSession(words.slice(0, 2));
  session = rateSession(session, session.ids[0], 'known');
  assert.deepEqual(
    reconcileSession(JSON.parse(JSON.stringify(session)), words.slice(0, 2)),
    session,
  );
  session = rateSession(session, session.ids[1], 'review');
  const extended = reconcileSession(session, words.slice(0, 3));
  assert.equal(extended.complete, false);
  assert.equal(extended.index, 2);
  const reduced = reconcileSession(extended, words.slice(0, 1));
  assert.equal(reduced.ids.length, 1);
  assert.equal(Object.keys(reduced.ratings).length, 1);
  assert.equal(reduced.complete, true);
});

test('review-only scope survives refresh and a new day starts a fresh prioritized session', () => {
  const review = createSession(words.slice(0, 2), {}, localDate(), 'review');
  assert.equal(reconcileSession(review, words).ids.length, 2);
  const tomorrow = reconcileSession(
    review,
    words,
    { [words[5].id]: { status: 'review', forgotten: 1 } },
    '2099-01-01',
  );
  assert.equal(tomorrow.ids.length, words.length);
  assert.equal(tomorrow.ids[0], words[5].id);
  assert.equal(tomorrow.scope, 'all');
  assert.equal(localDate(new Date(2026, 0, 2, 1)), '2026-01-02');
});

test('JavaScript property names are valid importable words and must be studied', () => {
  const custom = mergeVocabulary({}, [
    { word: 'constructor', translation: '建構子' },
    { word: '__proto__', translation: '原型' },
  ]);
  let session = createSession(custom);
  assert.equal(reconcileSession(session, custom).complete, false);
  session = rateSession(session, 'constructor', 'known');
  assert.equal(session.complete, false);
  session = rateSession(session, '__proto__', 'review');
  assert.equal(session.complete, true);
});

test('persistence round-trips and handles corrupt JSON, schema errors, and unavailable storage', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const state = {
    ...emptyState(),
    imported: [{ word: 'hello', translation: '你好' }],
    session: createSession(words),
  };
  assert.equal(saveState(storage, state), '');
  assert.deepEqual(loadState(storage).state, state);
  values.set(STORAGE_KEY, '{broken');
  assert.ok(loadState(storage).error);
  values.set(STORAGE_KEY, JSON.stringify({ ...state, progress: [] }));
  assert.ok(loadState(storage).error);
  values.set(
    STORAGE_KEY,
    JSON.stringify({ ...state, quizHistory: [{ date: 'invalid', score: 1, total: 1 }] }),
  );
  assert.deepEqual(loadState(storage).state.quizHistory, []);
  const blocked = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('quota');
    },
  };
  assert.ok(loadState(blocked).error);
  assert.ok(saveState(blocked, state));
});
