import { localDate } from './calendar.js';
export { localDate } from './calendar.js';

export function prioritize(words, progress) {
  return [...words].sort((a, b) => {
    const priority = (item) => (progress[item.id]?.status === 'review' ? 1 : 0);
    return (
      priority(b) - priority(a) ||
      (priority(a) ? (progress[b.id]?.forgotten || 0) - (progress[a.id]?.forgotten || 0) : 0)
    );
  });
}

export function createSession(words, progress = {}, date = localDate(), scope = 'all') {
  return {
    date,
    scope,
    ids: prioritize(words, progress).map((item) => item.id),
    index: 0,
    ratings: {},
    complete: false,
  };
}

export function reconcileSession(session, words, progress = {}, date = localDate()) {
  if (!session || session.date !== date || !Array.isArray(session.ids))
    return createSession(words, progress, date);
  const valid = new Set(words.map((item) => item.id));
  const ids = [...new Set(session.ids.filter((id) => valid.has(id)))];
  const added =
    session.scope === 'review'
      ? []
      : words.filter((item) => !ids.includes(item.id)).map((item) => item.id);
  ids.push(...added);
  const ratings = Object.fromEntries(
    Object.entries(session.ratings || {}).filter(
      ([id, value]) => valid.has(id) && ['known', 'review'].includes(value),
    ),
  );
  const savedIndex = ids.indexOf(session.ids[session.index]);
  const nextUnrated = ids.findIndex((id) => !Object.hasOwn(ratings, id));
  return {
    date,
    scope: session.scope === 'review' ? 'review' : 'all',
    ids,
    ratings,
    index: Math.max(0, session.complete || savedIndex < 0 ? nextUnrated : savedIndex),
    complete: ids.length > 0 && ids.every((id) => Object.hasOwn(ratings, id)),
  };
}

export function rateWord(progress, id, status, now = new Date().toISOString()) {
  const previous = Object.hasOwn(progress, id) ? progress[id] : {};
  return {
    ...progress,
    [id]: {
      status,
      seen: (previous.seen || 0) + 1,
      forgotten: (previous.forgotten || 0) + (status === 'review' ? 1 : 0),
      updatedAt: now,
    },
  };
}

export function rateSession(session, id, status) {
  const ratings = { ...session.ratings, [id]: status };
  const next = session.ids.findIndex(
    (item, index) => index > session.index && !Object.hasOwn(ratings, item),
  );
  const fallback = session.ids.findIndex((item) => !Object.hasOwn(ratings, item));
  return {
    ...session,
    ratings,
    index: next >= 0 ? next : Math.max(0, fallback),
    complete: fallback < 0,
  };
}
