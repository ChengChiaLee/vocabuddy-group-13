import { localDate } from './calendar.js';
import { newReview, normalizeReview } from './srs.js';

export const LEGACY_STORAGE_KEY = 'ytp-vocabuddy:v1';
export const STORAGE_KEY = 'ytp-vocabuddy:v2';
export const BACKUP_KEY = `${STORAGE_KEY}:backup`;
export const emptyState = () => ({
  version: 2,
  imported: [],
  progress: {},
  session: null,
  srs: {},
  practice: {},
  reviewSession: null,
  reviewEvents: [],
  activeQuiz: null,
  quizHistory: [],
});
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
function cleanProgress(value) {
  if (!object(value)) throw new Error('Invalid progress');
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, record]) => record && ['known', 'review'].includes(record.status))
      .map(([id, record]) => [
        id,
        {
          ...record,
          seen: Number.isFinite(record.seen) ? Math.max(0, record.seen) : 0,
          forgotten: Number.isFinite(record.forgotten) ? Math.max(0, record.forgotten) : 0,
        },
      ]),
  );
}
function cleanCommon(value) {
  if (!object(value) || !Array.isArray(value.imported)) throw new Error('Invalid stored data');
  return {
    ...emptyState(),
    ...value,
    imported: value.imported.filter(
      (item) => typeof item?.word === 'string' && typeof item?.translation === 'string',
    ),
    progress: cleanProgress(value.progress),
    quizHistory: Array.isArray(value.quizHistory)
      ? value.quizHistory
          .filter(
            (item) =>
              item &&
              Number.isFinite(item.score) &&
              Number.isFinite(item.total) &&
              item.total > 0 &&
              item.score >= 0 &&
              item.score <= item.total &&
              typeof item.date === 'string' &&
              Number.isFinite(Date.parse(item.date)),
          )
          .slice(-50)
      : [],
  };
}
export function migrateLegacy(value, now = new Date()) {
  if (value?.version === 2) return normalizeState(value);
  if (value?.version !== 1) throw new Error('Unsupported storage version');
  const state = cleanCommon(value);
  const srs = Object.fromEntries(
    Object.entries(state.progress).map(([id]) => [id, { ...newReview(id), dueAt: localDate(now) }]),
  );
  return {
    ...state,
    version: 2,
    srs,
    reviewSession: null,
    reviewEvents: [],
    practice: {},
    activeQuiz: null,
  };
}
export function normalizeState(value) {
  if (value?.version !== 2 || !object(value.srs)) throw new Error('Invalid schema');
  const state = cleanCommon(value);
  const srs = Object.fromEntries(
    Object.entries(value.srs)
      .filter(([, record]) => object(record))
      .map(([id, record]) => [id, normalizeReview(id, record)]),
  );
  const practice = Object.fromEntries(
    Object.entries(object(value.practice) ? value.practice : {})
      .filter(([, record]) => object(record))
      .map(([id, record]) => [
        id,
        {
          ...record,
          attempts: Math.max(0, Number.isFinite(record.attempts) ? record.attempts : 0),
          correct: Math.max(0, Number.isFinite(record.correct) ? record.correct : 0),
          incorrect: Math.max(0, Number.isFinite(record.incorrect) ? record.incorrect : 0),
          needsPractice: record.needsPractice === true,
        },
      ]),
  );
  return {
    ...state,
    version: 2,
    srs,
    practice,
    reviewEvents: Array.isArray(value.reviewEvents)
      ? value.reviewEvents
          .filter(
            (event) =>
              event &&
              typeof event.id === 'string' &&
              typeof event.wordId === 'string' &&
              ['again', 'hard', 'good', 'easy'].includes(event.rating) &&
              typeof event.day === 'string',
          )
          .slice(-5000)
      : [],
    reviewSession:
      object(value.reviewSession) &&
      Array.isArray(value.reviewSession.queue) &&
      Array.isArray(value.reviewSession.ids) &&
      Array.isArray(value.reviewSession.completedIds)
        ? value.reviewSession
        : null,
    activeQuiz: object(value.activeQuiz) ? value.activeQuiz : null,
  };
}
export function loadState(storage, now = new Date()) {
  let damaged = false;
  try {
    for (const key of [STORAGE_KEY, BACKUP_KEY, LEGACY_STORAGE_KEY]) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw);
        const state =
          key === LEGACY_STORAGE_KEY ? migrateLegacy(value, now) : normalizeState(value);
        return {
          state,
          error: damaged ? '部分進度資料損壞，已從可用的本機備份恢復。' : '',
          migrated: key === LEGACY_STORAGE_KEY,
        };
      } catch {
        damaged = true;
      }
    }
    return { state: emptyState(), error: damaged ? '無法讀取先前的進度，本次仍可正常學習。' : '' };
  } catch {
    return { state: emptyState(), error: '瀏覽器暫時無法讀寫進度，本次仍可正常學習。' };
  }
}
export function saveState(storage, state) {
  try {
    const encoded = JSON.stringify(state);
    storage.setItem(STORAGE_KEY, encoded);
    if (storage.getItem(STORAGE_KEY) !== encoded) throw new Error('Storage verification failed');
    storage.setItem(BACKUP_KEY, encoded);
    // Preserve the v1 key, including after a verified migration.
    return '';
  } catch {
    return '瀏覽器暫時無法完整儲存進度；請保留此分頁，以繼續本次學習。';
  }
}
