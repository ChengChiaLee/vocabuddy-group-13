import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { addDays, localDate, validDay } from '../src/lib/calendar.js';
import {
  newReview,
  scheduleReview,
  reviewQueue,
  createReviewSession,
  applyReview,
  reconcileReviewSession,
  prepareReviewState,
  reviewStats,
  isFamiliar,
} from '../src/lib/srs.js';
import {
  emptyState,
  migrateLegacy,
  loadState,
  saveState,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  BACKUP_KEY,
} from '../src/lib/storage.js';

const now = new Date(2026, 9, 17, 12);
const today = localDate(now);
const words = ['alpha', 'beta', 'gamma', 'delta'].map((id) => ({ id, word: id, translation: id }));
const state = () => ({
  ...emptyState(),
  reviewSession: createReviewSession(words, {}, {}, now, 'due', 'controlled-session'),
});
const event = (value, rating = 'good') => ({
  wordId: value.reviewSession.queue[value.reviewSession.index],
  rating,
  revision: value.reviewSession.revision,
  sessionId: value.reviewSession.id,
});

test('four ratings schedule new cards deterministically without mutating metadata', () => {
  const original = newReview('alpha');
  const results = ['again', 'hard', 'good', 'easy'].map((rating) =>
    scheduleReview(original, rating, now),
  );
  assert.deepEqual(
    results.map((record) => record.intervalDays),
    [0, 1, 1, 4],
  );
  assert.deepEqual(
    results.map((record) => record.dueAt),
    [today, addDays(today, 1), addDays(today, 1), addDays(today, 4)],
  );
  assert.deepEqual(original, newReview('alpha'));
  assert.equal(results[0].lapses, 1);
  assert.equal(results[2].correctCount, 1);
  assert.equal(results[0].incorrectCount, 1);
});
test('Good progresses 1/6/15 days; Hard is shorter, Easy longer; Again resets repetitions', () => {
  const first = scheduleReview(newReview('alpha'), 'good', now);
  const second = scheduleReview(first, 'good', now);
  const third = scheduleReview(second, 'good', now);
  assert.deepEqual([first.intervalDays, second.intervalDays, third.intervalDays], [1, 6, 15]);
  assert.ok(scheduleReview(second, 'hard', now).intervalDays < third.intervalDays);
  assert.ok(scheduleReview(second, 'easy', now).intervalDays > third.intervalDays);
  const lapse = scheduleReview(third, 'again', now);
  assert.equal(lapse.repetitions, 0);
  assert.equal(scheduleReview(lapse, 'good', now).intervalDays, 1);
  assert.ok(isFamiliar(third));
  assert.equal(isFamiliar(first), false);
  let hard = first;
  for (let i = 0; i < 30; i++) hard = scheduleReview(hard, 'hard', now);
  assert.ok(hard.easeFactor >= 1.3);
});
test('calendar boundaries are validated, including leap day and year changes', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(validDay('2026-02-30'), false);
  assert.throws(() => addDays('2026-02-30', 1));
});
test('review dates remain calendar dates across DST and timezone changes', () => {
  for (const zone of ['America/New_York', 'Asia/Taipei', 'Pacific/Auckland']) {
    const script = `import {scheduleReview,newReview} from ${JSON.stringify(new URL('../src/lib/srs.js', import.meta.url).href)}; console.log(scheduleReview(newReview('x'),'good',new Date(2026,2,8,0,30)).dueAt)`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: zone },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '2026-03-09');
  }
});
test('stable queue prioritizes overdue/due before new words and removes duplicate ids', () => {
  const srs = {
    beta: { ...newReview('beta'), dueAt: addDays(today, -2) },
    gamma: { ...newReview('gamma'), dueAt: today },
    delta: scheduleReview(newReview('delta'), 'easy', now),
  };
  assert.deepEqual(
    reviewQueue([...words, ...words], srs, {}, today).map((w) => w.id),
    ['beta', 'gamma', 'alpha'],
  );
  assert.deepEqual(
    reviewQueue(words, srs, {}, today, 'review').map((w) => w.id),
    ['beta', 'gamma'],
  );
  assert.equal(reviewQueue(words, srs, {}, today, 'all').length, 4);
});
test('review transactions reject stale/duplicate submissions and leave one Again queue entry', () => {
  let current = state();
  const action = event(current, 'again');
  current = applyReview(current, action, now);
  assert.deepEqual(current.reviewSession.queue, ['beta', 'gamma', 'alpha', 'delta']);
  assert.equal(applyReview(current, action, now), current);
  assert.equal(current.reviewEvents.length, 1);
  assert.equal(new Set(current.reviewSession.queue).size, current.reviewSession.queue.length);
  assert.equal(current.progress.alpha.status, 'review');
  assert.equal(current.srs.alpha.lastRating, 'again');
});
test('single-card Again waits, survives reload, and then completes normally', () => {
  let current = {
    ...state(),
    reviewSession: createReviewSession(words.slice(0, 1), {}, {}, now, 'due', 'one'),
  };
  current = applyReview(current, event(current, 'again'), now);
  assert.equal(current.reviewSession.complete, false);
  assert.equal(applyReview(current, event(current), now), current);
  current.reviewSession = reconcileReviewSession(
    JSON.parse(JSON.stringify(current.reviewSession)),
    words.slice(0, 1),
    current.srs,
    {},
    now,
  );
  current = applyReview(current, event(current), new Date(now.getTime() + 10001));
  assert.equal(current.reviewSession.complete, true);
  assert.equal(current.srs.alpha.reviewCount, 2);
});
test('migration preserves imports, old known/forgotten values and old session position', () => {
  const legacy = {
    version: 1,
    imported: [{ word: 'custom', translation: '自訂' }],
    progress: {
      alpha: { status: 'known', seen: 2, forgotten: 0 },
      beta: { status: 'review', seen: 4, forgotten: 3 },
    },
    session: { date: today, ids: words.map((w) => w.id), index: 1, ratings: { alpha: 'known' } },
  };
  const migrated = migrateLegacy(legacy, now);
  assert.deepEqual(migrated.imported, legacy.imported);
  assert.deepEqual(migrated.progress, legacy.progress);
  assert.deepEqual(migrateLegacy(migrated, now), migrated);
  const prepared = prepareReviewState(migrated, words, now);
  assert.deepEqual(prepared.reviewSession.completedIds, ['alpha']);
  assert.equal(prepared.reviewSession.queue[prepared.reviewSession.index], 'beta');
  assert.equal(migrated.srs.alpha.repetitions, 0);
  assert.equal(isFamiliar(migrated.srs.alpha), false);
});
test('v2 saves verify their write, preserve v1, and recover a corrupted v2 from backup', () => {
  const legacy = {
    version: 1,
    imported: [],
    progress: { alpha: { status: 'known', seen: 1, forgotten: 0 } },
    session: null,
  };
  const values = new Map([[LEGACY_STORAGE_KEY, JSON.stringify(legacy)]]);
  const storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  const loaded = loadState(storage, now);
  assert.equal(loaded.migrated, true);
  assert.equal(saveState(storage, loaded.state), '');
  assert.equal(values.get(LEGACY_STORAGE_KEY), JSON.stringify(legacy));
  values.set(STORAGE_KEY, 'broken');
  const recovered = loadState(storage, now);
  assert.equal(recovered.state.progress.alpha.status, 'known');
  assert.ok(recovered.error);
  assert.ok(values.get(BACKUP_KEY));
});
test('daily statistics use actual review events and distinct successfully reviewed words', () => {
  let current = state();
  current = applyReview(current, event(current), now);
  current = applyReview(current, event(current, 'again'), now);
  const stats = reviewStats(words, current.srs, current.practice, current.reviewEvents, now);
  assert.equal(stats.completed, 1);
  assert.equal(stats.reviews, 2);
  assert.equal(stats.familiar, 0);
  assert.equal(stats.newCards, 2);
  assert.equal(stats.due, 1);
  const withPractice = reviewStats(
    words,
    current.srs,
    { gamma: { needsPractice: true } },
    current.reviewEvents,
    now,
  );
  assert.equal(withPractice.learning, 3);
  assert.equal(withPractice.familiar + withPractice.learning + withPractice.newCards, words.length);
});
test('a quiz practice flag reopens a completed card before new words without changing its schedule', () => {
  let current = state();
  current = applyReview(current, event(current), now);
  const previous = current.srs.alpha;
  const session = reconcileReviewSession(
    current.reviewSession,
    words,
    current.srs,
    { alpha: { needsPractice: true } },
    now,
  );
  assert.equal(session.queue[0], 'alpha');
  assert.equal(session.index, 0);
  assert.equal(session.completedIds.includes('alpha'), false);
  assert.equal(current.srs.alpha, previous);
});
