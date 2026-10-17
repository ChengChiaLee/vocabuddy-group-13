import { shuffle } from './vocabulary.js';
import { normalizeText } from './example-contract.js';
import { own } from './srs.js';

export const QUIZ_TYPES = { multiple: '四選一測驗', spelling: '拼字測驗', listening: '聽力測驗' };
export function matchesSpelling(answer, word, alternatives = []) {
  if (typeof answer !== 'string' || typeof word !== 'string') return false;
  const accepted = [word, ...alternatives.filter((item) => typeof item === 'string')].map(
    normalizeText,
  );
  return accepted.includes(normalizeText(answer));
}
export function questionCounts(available) {
  return [...[5, 10, 20].filter((count) => count <= available), ...(available ? ['all'] : [])];
}
export function createQuizRun(
  vocabulary,
  {
    type = 'multiple',
    count = 10,
    randomized = true,
    scope = 'all',
    alternatives = {},
    id = globalThis.crypto.randomUUID(),
    random = Math.random,
  } = {},
) {
  if (!Object.hasOwn(QUIZ_TYPES, type)) throw new Error('請選擇有效的測驗模式。');
  const unique = [...new Map(vocabulary.map((word) => [word.id, word])).values()];
  const ordered = randomized ? shuffle(unique, random) : unique;
  const selected = ordered.slice(
    0,
    count === 'all' ? ordered.length : Math.max(0, Number(count) || 0),
  );
  const optionsById =
    type === 'multiple'
      ? new Map(
          createQuiz(unique, unique.length, random).map((question) => [
            question.id,
            question.options,
          ]),
        )
      : null;
  const questions = selected.map((word) => ({
    ...word,
    alternativeSpellings: Array.isArray(own(alternatives, word.id))
      ? own(alternatives, word.id).filter((value) => typeof value === 'string')
      : [],
    ...(type === 'multiple' ? { options: optionsById.get(word.id) } : {}),
  }));
  return {
    id,
    type,
    scope,
    randomized,
    questions,
    index: 0,
    answers: [],
    score: 0,
    done: !questions.length,
  };
}
export function submitQuizAnswer(run, raw, now = new Date()) {
  if (run.done || run.answers.length > run.index || typeof raw !== 'string' || !raw.trim())
    return run;
  const question = run.questions[run.index];
  if (!question || (run.type === 'multiple' && !question.options.includes(raw))) return run;
  const correct =
    run.type === 'multiple'
      ? raw === question.translation
      : matchesSpelling(raw, question.word, question.alternativeSpellings);
  const answer = {
    wordId: question.id,
    word: question.word,
    translation: question.translation,
    answer: raw.trim(),
    correct,
    attemptId: `${run.id}:${run.index}`,
    at: now.toISOString(),
  };
  const answers = [...run.answers, answer];
  return { ...run, answers, score: answers.filter((item) => item.correct).length };
}
export function advanceQuiz(run) {
  if (run.done || run.answers.length <= run.index) return run;
  return run.index === run.questions.length - 1
    ? { ...run, done: true }
    : { ...run, index: run.index + 1 };
}
export function restoreQuizRun(run, vocabulary) {
  if (
    !run ||
    !Object.hasOwn(QUIZ_TYPES, run.type) ||
    typeof run.id !== 'string' ||
    !Array.isArray(run.questions) ||
    !run.questions.length ||
    !Array.isArray(run.answers)
  )
    return null;
  const valid = new Map(vocabulary.map((word) => [word.id, word]));
  if (
    !Number.isInteger(run.index) ||
    run.index < 0 ||
    run.index >= run.questions.length ||
    new Set(run.questions.map((q) => q?.id)).size !== run.questions.length
  )
    return null;
  if (
    run.questions.some(
      (q) =>
        !q ||
        valid.get(q.id)?.word !== q.word ||
        valid.get(q.id)?.translation !== q.translation ||
        !Array.isArray(q.alternativeSpellings) ||
        (run.type === 'multiple' &&
          (!Array.isArray(q.options) ||
            q.options.length < 1 ||
            q.options.length > 4 ||
            q.options.some((option) => typeof option !== 'string') ||
            new Set(q.options).size !== q.options.length ||
            !q.options.includes(q.translation))),
    )
  )
    return null;
  if (
    run.answers.length < run.index ||
    run.answers.length > run.index + 1 ||
    (run.done && run.answers.length !== run.questions.length)
  )
    return null;
  if (
    run.answers.some(
      (a, index) =>
        !a ||
        a.wordId !== run.questions[index].id ||
        a.attemptId !== `${run.id}:${index}` ||
        typeof a.answer !== 'string' ||
        a.correct !==
          (run.type === 'multiple'
            ? a.answer === run.questions[index].translation
            : matchesSpelling(
                a.answer,
                run.questions[index].word,
                run.questions[index].alternativeSpellings,
              )),
    )
  )
    return null;
  return { ...run, score: run.answers.filter((answer) => answer.correct).length };
}
export function recordPractice(state, answer) {
  const previous = own(state.practice, answer.wordId) || {
    attempts: 0,
    correct: 0,
    incorrect: 0,
    needsPractice: false,
  };
  if (previous.lastAttemptId === answer.attemptId) return state;
  return {
    ...state,
    practice: {
      ...state.practice,
      [answer.wordId]: {
        ...previous,
        attempts: previous.attempts + 1,
        correct: previous.correct + (answer.correct ? 1 : 0),
        incorrect: previous.incorrect + (answer.correct ? 0 : 1),
        needsPractice: previous.needsPractice || !answer.correct,
        lastAttemptId: answer.attemptId,
        lastPracticedAt: answer.at,
      },
    },
  };
}
export function completeQuiz(state, run, now = new Date()) {
  if (
    !run.done ||
    !run.questions.length ||
    run.answers.length !== run.questions.length ||
    state.quizHistory.some((item) => item.id === run.id)
  )
    return state;
  return {
    ...state,
    quizHistory: [
      ...state.quizHistory,
      {
        id: run.id,
        type: run.type,
        score: run.answers.filter((answer) => answer.correct).length,
        total: run.questions.length,
        date: now.toISOString(),
        mistakes: run.answers.filter((answer) => !answer.correct),
      },
    ].slice(-50),
  };
}

export function createQuiz(vocabulary, count = 10, random = Math.random) {
  const translations = [...new Set(vocabulary.map((item) => item.translation))];
  return shuffle(vocabulary, random)
    .slice(0, Math.max(0, count))
    .map((item) => ({
      ...item,
      options: shuffle(
        [
          item.translation,
          ...shuffle(
            translations.filter((translation) => translation !== item.translation),
            random,
          ).slice(0, 3),
        ],
        random,
      ),
    }));
}

export function quizAccuracy(score, total) {
  return total ? Math.round((score / total) * 100) : 0;
}
