import { addDays, localDate, validDay } from './calendar.js';

export const RATINGS = ['again', 'hard', 'good', 'easy'];
export const RETRY_DELAY_MS = 10000;
export const RATING_LABELS = { again: '再來一次', hard: '困難', good: '良好', easy: '簡單' };
export const own = (object, id) => (Object.hasOwn(object || {}, id) ? object[id] : undefined);

export function newReview(wordId) {
  return {
    wordId,
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueAt: null,
    lastReviewedAt: null,
    lastReviewedDay: null,
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    lapses: 0,
    lastRating: null,
  };
}
export function normalizeReview(id, value = {}) {
  const result = newReview(id);
  for (const key of [
    'repetitions',
    'intervalDays',
    'reviewCount',
    'correctCount',
    'incorrectCount',
    'lapses',
  ]) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0)
      result[key] = Math.min(value[key], 1000000);
  }
  result.intervalDays = Math.min(result.intervalDays, 3650);
  if (Number.isFinite(value.easeFactor))
    result.easeFactor = Math.min(3.5, Math.max(1.3, value.easeFactor));
  result.dueAt = validDay(value.dueAt) ? value.dueAt : null;
  result.lastReviewedAt =
    typeof value.lastReviewedAt === 'string' && Number.isFinite(Date.parse(value.lastReviewedAt))
      ? value.lastReviewedAt
      : null;
  result.lastReviewedDay = validDay(value.lastReviewedDay) ? value.lastReviewedDay : null;
  result.lastRating = RATINGS.includes(value.lastRating) ? value.lastRating : null;
  return result;
}
// Four-button SM-2 adaptation, not FSRS. Pure and clock-controlled.
export function scheduleReview(previous, rating, now = new Date()) {
  if (!RATINGS.includes(rating)) throw new Error('無效的複習評分。');
  const record = normalizeReview(previous.wordId, previous);
  const quality = { again: 1, hard: 3, good: 4, easy: 5 }[rating];
  const easeFactor =
    Math.round(
      Math.min(
        3.5,
        Math.max(1.3, record.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
      ) * 100,
    ) / 100;
  const normal =
    record.repetitions === 0
      ? 1
      : record.repetitions === 1
        ? 6
        : Math.ceil(record.intervalDays * record.easeFactor);
  let intervalDays = normal;
  if (rating === 'again') intervalDays = 0;
  if (rating === 'hard')
    intervalDays =
      record.repetitions === 0 ? 1 : Math.max(record.intervalDays + 1, Math.ceil(normal * 0.6));
  if (rating === 'easy') intervalDays = record.repetitions === 0 ? 4 : Math.ceil(normal * 1.3);
  intervalDays = Math.min(3650, Math.max(0, intervalDays));
  const day = localDate(now);
  return {
    ...record,
    repetitions: rating === 'again' ? 0 : record.repetitions + 1,
    intervalDays,
    easeFactor,
    dueAt: addDays(day, intervalDays),
    lastReviewedAt: now.toISOString(),
    lastReviewedDay: day,
    lastRating: rating,
    reviewCount: record.reviewCount + 1,
    correctCount: record.correctCount + (rating === 'again' ? 0 : 1),
    incorrectCount: record.incorrectCount + (rating === 'again' ? 1 : 0),
    lapses: record.lapses + (rating === 'again' ? 1 : 0),
  };
}
export function reviewCategory(id, srs, practice = {}, today = localDate()) {
  const record = own(srs, id);
  if (record?.dueAt && record.dueAt < today) return 'overdue';
  if (record?.lastRating === 'again' && record.dueAt <= today) return 'forgotten';
  if (record?.dueAt && record.dueAt <= today) return 'due';
  if (own(practice, id)?.needsPractice) return 'practice';
  if (!record || (!record.dueAt && !record.reviewCount)) return 'new';
  return 'scheduled';
}
export function reviewQueue(words, srs = {}, practice = {}, today = localDate(), scope = 'due') {
  const priorities = { overdue: 0, forgotten: 1, due: 2, practice: 3, new: 4, scheduled: 5 };
  const unique = [...new Map(words.map((word) => [word.id, word])).values()];
  return unique
    .filter((word) => {
      const category = reviewCategory(word.id, srs, practice, today);
      return (
        scope === 'all' || (category !== 'scheduled' && (scope !== 'review' || category !== 'new'))
      );
    })
    .sort(
      (a, b) =>
        priorities[reviewCategory(a.id, srs, practice, today)] -
          priorities[reviewCategory(b.id, srs, practice, today)] ||
        (own(srs, a.id)?.dueAt || today).localeCompare(own(srs, b.id)?.dueAt || today),
    );
}
export function createReviewSession(
  words,
  srs = {},
  practice = {},
  now = new Date(),
  scope = 'due',
  id = globalThis.crypto.randomUUID(),
) {
  const queue = reviewQueue(words, srs, practice, localDate(now), scope).map((word) => word.id);
  return {
    id,
    date: localDate(now),
    scope,
    ids: [...queue],
    queue,
    index: 0,
    ratings: {},
    completedIds: [],
    retryAt: {},
    revision: 0,
    complete: queue.length === 0,
  };
}
export function reconcileReviewSession(session, words, srs = {}, practice = {}, now = new Date()) {
  if (
    !session ||
    session.date !== localDate(now) ||
    !Array.isArray(session.queue) ||
    typeof session.id !== 'string'
  )
    return createReviewSession(words, srs, practice, now);
  const valid = new Set(words.map((word) => word.id));
  const completedIds = [
    ...new Set(
      (session.completedIds || []).filter(
        (id) => valid.has(id) && !own(practice, id)?.needsPractice,
      ),
    ),
  ];
  const done = new Set(completedIds);
  const queue = [...new Set(session.queue.filter((id) => valid.has(id) && !done.has(id)))];
  const scope = ['due', 'review', 'all'].includes(session.scope) ? session.scope : 'due';
  const urgent = [];
  for (const word of reviewQueue(words, srs, practice, localDate(now), scope))
    if (!queue.includes(word.id) && !done.has(word.id)) {
      if (scope !== 'all' && reviewCategory(word.id, srs, practice, localDate(now)) !== 'new')
        urgent.push(word.id);
      else queue.push(word.id);
    }
  queue.unshift(...urgent);
  const current = session.queue[session.index];
  return {
    ...session,
    scope,
    ids: [...new Set([...(session.ids || []).filter((id) => valid.has(id)), ...queue])],
    queue,
    completedIds,
    index: urgent.length ? 0 : Math.max(0, queue.indexOf(current)),
    revision: Number.isSafeInteger(session.revision) ? session.revision : 0,
    ratings: Object.fromEntries(
      Object.entries(session.ratings || {}).filter(
        ([id, rating]) => valid.has(id) && RATINGS.includes(rating),
      ),
    ),
    retryAt: Object.fromEntries(
      Object.entries(session.retryAt || {}).filter(
        ([id, at]) => valid.has(id) && Number.isFinite(at),
      ),
    ),
    complete: queue.length === 0,
  };
}
export function prepareReviewState(state, words, now = new Date()) {
  let reviewSession = reconcileReviewSession(
    state.reviewSession,
    words,
    state.srs,
    state.practice,
    now,
  );
  if (
    !state.reviewSession &&
    state.session?.date === localDate(now) &&
    Array.isArray(state.session.ids)
  ) {
    const valid = new Set(words.map((word) => word.id));
    const completedIds = state.session.ids.filter(
      (id) => valid.has(id) && own(state.session.ratings, id) === 'known',
    );
    const done = new Set(completedIds);
    const queue = reviewSession.queue.filter((id) => !done.has(id));
    reviewSession = {
      ...reviewSession,
      completedIds,
      queue,
      ids: [...new Set([...state.session.ids.filter((id) => valid.has(id)), ...reviewSession.ids])],
      index: Math.max(0, queue.indexOf(state.session.ids[state.session.index])),
      complete: !queue.length,
    };
  }
  return { ...state, reviewSession };
}
export function applyReview(state, { wordId, rating, revision, sessionId }, now = new Date()) {
  const session = state.reviewSession;
  if (
    !session ||
    session.id !== sessionId ||
    session.revision !== revision ||
    session.queue[session.index] !== wordId ||
    !RATINGS.includes(rating) ||
    (own(session.retryAt, wordId) || 0) > now.getTime()
  )
    return state;
  const eventId = `${sessionId}:${revision}:${wordId}`;
  if (state.reviewEvents.some((event) => event.id === eventId)) return state;
  const record = scheduleReview(own(state.srs, wordId) || newReview(wordId), rating, now);
  const queue = session.queue.filter((id) => id !== wordId);
  const completedIds = session.completedIds.filter((id) => id !== wordId);
  const retryAt = { ...session.retryAt };
  if (rating === 'again') {
    queue.splice(Math.min(session.index + 2, queue.length), 0, wordId);
    retryAt[wordId] = now.getTime() + RETRY_DELAY_MS;
  } else {
    completedIds.push(wordId);
    delete retryAt[wordId];
  }
  let index = Math.min(session.index, Math.max(0, queue.length - 1));
  if ((own(retryAt, queue[index]) || 0) > now.getTime()) {
    const ready = queue.findIndex((id) => (own(retryAt, id) || 0) <= now.getTime());
    if (ready >= 0) index = ready;
  }
  const oldProgress = own(state.progress, wordId) || {};
  const oldPractice = own(state.practice, wordId);
  return {
    ...state,
    srs: { ...state.srs, [wordId]: record },
    progress: {
      ...state.progress,
      [wordId]: {
        ...oldProgress,
        status: rating === 'again' ? 'review' : 'known',
        seen: (oldProgress.seen || 0) + 1,
        forgotten: (oldProgress.forgotten || 0) + (rating === 'again' ? 1 : 0),
        updatedAt: now.toISOString(),
      },
    },
    practice:
      oldPractice && rating !== 'again'
        ? { ...state.practice, [wordId]: { ...oldPractice, needsPractice: false } }
        : state.practice,
    reviewSession: {
      ...session,
      queue,
      index,
      completedIds,
      retryAt,
      ratings: { ...session.ratings, [wordId]: rating },
      revision: revision + 1,
      complete: !queue.length,
    },
    reviewEvents: [
      ...state.reviewEvents,
      {
        id: eventId,
        wordId,
        rating,
        day: localDate(now),
        at: now.toISOString(),
        dueAt: record.dueAt,
      },
    ].slice(-5000),
  };
}
export function isFamiliar(record) {
  return Boolean(
    record && record.repetitions >= 3 && record.intervalDays >= 14 && record.lastRating !== 'again',
  );
}
export function reviewStats(words, srs, practice = {}, events = [], now = new Date()) {
  const today = localDate(now);
  const categories = words.map((word) => reviewCategory(word.id, srs, practice, today));
  const valid = new Set(words.map((word) => word.id));
  const todayEvents = events.filter((event) => event.day === today && valid.has(event.wordId));
  const records = words.map((word) => own(srs, word.id)).filter(Boolean);
  return {
    due: categories.filter((category) =>
      ['overdue', 'forgotten', 'due', 'practice'].includes(category),
    ).length,
    overdue: categories.filter((category) => category === 'overdue').length,
    newCards: categories.filter((category) => category === 'new').length,
    completed: new Set(
      todayEvents.filter((event) => event.rating !== 'again').map((event) => event.wordId),
    ).size,
    reviews: todayEvents.length,
    learning: words.filter((word) => {
      const record = own(srs, word.id);
      return (
        !isFamiliar(record) &&
        Boolean(record?.reviewCount || record?.dueAt || own(practice, word.id)?.needsPractice)
      );
    }).length,
    familiar: records.filter(isFamiliar).length,
    nextDue:
      records
        .map((record) => record.dueAt)
        .filter((date) => date && date > today)
        .sort()[0] || null,
  };
}
export function nextReviewLabel(record, now = new Date()) {
  if (!record?.dueAt) return '尚未安排';
  const today = localDate(now);
  if (record.dueAt < today) return `已逾期 · ${record.dueAt}`;
  if (record.dueAt === today) return record.lastRating === 'again' ? '本輪稍後再練' : '今天';
  if (record.dueAt === addDays(today, 1)) return '明天';
  return record.dueAt;
}
