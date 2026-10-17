import { wordId } from './vocabulary.js';
export const PROMPT_VERSION = 'vocabuddy-examples-1';
export const CONTEXTS = {
  everyday: '日常生活',
  academic: '學術英文',
  programming: '程式設計',
  exam: '考試準備',
};
export const DIFFICULTIES = { basic: '基礎', intermediate: '中階', advanced: '進階' };
export function normalizeText(value) {
  return value
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
}
export function containsVocabulary(sentence, word) {
  const escaped = normalizeText(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'u').test(
    normalizeText(sentence),
  );
}
export function validateExampleInput(value) {
  const allowed = ['wordId', 'word', 'translation', 'context', 'difficulty', 'promptVersion'];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('例句請求格式不正確。');
  for (const [key, max] of [
    ['wordId', 120],
    ['word', 120],
    ['translation', 500],
  ]) {
    if (
      typeof value[key] !== 'string' ||
      !value[key].trim() ||
      value[key].length > max ||
      /[\p{C}\r\n]/u.test(value[key])
    )
      throw new Error('請提供有效的單字與中文翻譯。');
  }
  if (
    value.wordId !== wordId(value.word) ||
    !Object.hasOwn(CONTEXTS, value.context) ||
    !Object.hasOwn(DIFFICULTIES, value.difficulty) ||
    value.promptVersion !== PROMPT_VERSION
  )
    throw new Error('請選擇有效的情境、難度與例句版本。');
  return {
    wordId: value.wordId,
    word: value.word.trim(),
    translation: value.translation.trim(),
    context: value.context,
    difficulty: value.difficulty,
    promptVersion: PROMPT_VERSION,
  };
}
export function validateExampleOutput(value, request) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('例句服務回傳格式不正確。');
  for (const [key, max] of [
    ['english', 600],
    ['translation', 1000],
    ['explanation', 1200],
  ]) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > max)
      throw new Error('例句服務回傳的內容不完整。');
  }
  if (!containsVocabulary(value.english, request.word))
    throw new Error('例句未包含完整單字或片語，請重新產生。');
  if (!/\p{Script=Han}/u.test(value.translation) || !/\p{Script=Han}/u.test(value.explanation))
    throw new Error('例句服務未提供中文翻譯與說明。');
  if (
    !Array.isArray(value.notes) ||
    value.notes.length > 5 ||
    value.notes.some((note) => typeof note !== 'string' || !note.trim() || note.length > 200)
  )
    throw new Error('例句補充說明格式不正確。');
  return {
    english: value.english.trim(),
    translation: value.translation.trim(),
    explanation: value.explanation.trim(),
    notes: value.notes.map((note) => note.trim()),
  };
}
export const EXAMPLE_SCHEMA = {
  type: 'object',
  properties: {
    english: { type: 'string' },
    translation: { type: 'string' },
    explanation: { type: 'string' },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['english', 'translation', 'explanation', 'notes'],
  additionalProperties: false,
};
