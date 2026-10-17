// Optional browser tooling is loaded from an existing installation; never auto-installs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const toolsDirectory = process.env.VOCABUDDY_BROWSER_TOOLS;
const { chromium } = toolsDirectory
  ? require(resolve(toolsDirectory, 'node_modules/playwright-core'))
  : require('playwright-core');
const axePath = require.resolve('axe-core', { paths: [toolsDirectory || process.cwd()] });
const base = process.env.VOCABUDDY_BASE_URL || 'http://127.0.0.1:5173';
const executablePath =
  process.env.VOCABUDDY_CHROME_PATH ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined);
const output = resolve('test-results');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
const checks = [],
  audits = [],
  errors = [];
const key = 'ytp-vocabuddy:v2';
const defaults = JSON.parse(readFileSync(new URL('../vocabularies.json', import.meta.url), 'utf8'));
let page;
const saved = (p) => p.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const check = (name) => {
  checks.push(name);
  console.log('PASS', name);
};
async function audit(p, name) {
  await p.waitForTimeout(300);
  if (!(await p.evaluate(() => Boolean(window.axe)))) await p.addScriptTag({ path: axePath });
  const violations = await p.evaluate(async () =>
    (await axe.run()).violations.map((value) => ({
      id: value.id,
      impact: value.impact,
      nodes: value.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
  );
  audits.push({ name, violations });
  console.log('AUDIT', name, JSON.stringify(violations));
}
async function context(options = {}) {
  const result = await browser.newContext({ viewport: { width: 1440, height: 1050 }, ...options });
  await result.addInitScript(() => {
    window.__spoken = [];
    window.__cancelled = 0;
    class Utterance {
      constructor(text) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: Utterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [{ lang: 'en-US', name: 'test voice' }],
        cancel: () => {
          window.__cancelled++;
        },
        speak: (utterance) => {
          window.__spoken.push({
            text: utterance.text,
            rate: utterance.rate,
            lang: utterance.lang,
          });
          utterance.onstart?.();
          setTimeout(() => utterance.onend?.(), 20);
        },
      },
    });
  });
  return result;
}
async function tracked(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', (error) => errors.push(error.message));
  return p;
}
async function nav(p, name) {
  if (await p.locator('.menu-button').isVisible()) await p.locator('.menu-button').click();
  await p.getByRole('button', { name: new RegExp('^' + name) }).click();
}
async function chooseQuiz(p, type, count = '5') {
  await p.getByRole('button', { name: '考我單詞', exact: true }).click();
  if (await p.getByRole('button', { name: '選擇其他測驗', exact: true }).isVisible())
    await p.getByRole('button', { name: '選擇其他測驗', exact: true }).click();
  else if (await p.getByRole('button', { name: '選擇模式', exact: true }).isVisible())
    await p.getByRole('button', { name: '選擇模式', exact: true }).click();
  await p.getByLabel('單字範圍', { exact: false }).selectOption('all');
  await p.getByLabel('測驗題數', { exact: false }).selectOption(count);
  await p.getByLabel('隨機題目順序').uncheck();
  await p.getByRole('button', { name: `開始${type}`, exact: true }).click();
}
try {
  const ctx = await context();
  page = await tracked(ctx);
  const status = await page.request.get(`${base}/api/examples/status`);
  assert.equal(status.status(), 200);
  assert.equal((await status.json()).available, false);
  await page.goto(base);
  await page.locator('#current-word').waitFor();
  assert.equal(await page.locator('#current-word').innerText(), 'algorithm');
  assert.equal((await saved(page)).reviewSession.ids.length, 23);
  await audit(page, 'fresh SRS flashcard');
  await page.screenshot({
    path: resolve(output, 'upgrade-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('.reveal-button').click();
  await page.locator('.srs-rating.good').evaluate((button) => {
    button.click();
    button.click();
  });
  await page.waitForFunction(
    () => document.querySelector('#current-word')?.textContent === 'data structure',
  );
  let current = await saved(page);
  assert.equal(current.reviewEvents.length, 1);
  assert.equal(current.srs.algorithm.intervalDays, 1);
  assert.equal(current.srs.algorithm.reviewCount, 1);
  await page.reload();
  await page.locator('#current-word').waitFor();
  assert.equal(await page.locator('#current-word').innerText(), 'data structure');
  await page.locator('.reveal-button').click();
  await page.locator('.srs-rating.again').click();
  current = await saved(page);
  assert.equal(current.reviewSession.queue.filter((id) => id === 'data structure').length, 1);
  assert.equal(current.srs['data structure'].lastRating, 'again');
  await page.clock.install();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.locator('#current-word').waitFor();
  assert.equal(await page.locator('#current-word').innerText(), 'data structure');
  await page.locator('.reveal-button').click();
  assert.equal(await page.locator('.srs-rating:disabled').count(), 4);
  await page.clock.fastForward(11000);
  await page.locator('.srs-rating.good').click();
  assert.equal((await saved(page)).srs['data structure'].reviewCount, 2);
  await page.clock.resume();
  check('SRS scheduling, rapid-click protection, reload recovery, Again delay and unique queue');

  await page.getByRole('button', { name: 'AI 例句', exact: true }).click();
  await page.getByText('AI 例句，準備中').waitFor();
  await audit(page, 'unconfigured AI panel');
  await page.getByRole('button', { name: '收合 AI 例句' }).click();
  await page.locator('.import-nav').click();
  await page
    .locator('#vocabulary-input')
    .fill('apple,蘋果\ngive up,放棄\nAPPLE,青蘋果\nalgorithm,覆寫\nbroken\nmissing,');
  await page.getByRole('button', { name: '匯入單字', exact: true }).click();
  await page.getByText('成功匯入 2 個單字！已加入你的單字庫。').waitFor();
  assert.equal((await saved(page)).imported.length, 2);
  assert.match(await page.locator('.import-errors').innerText(), /第 5 行/);
  await audit(page, 'partial vocabulary import');
  await page.reload();
  await page.locator('#current-word').waitFor();
  assert.equal((await saved(page)).imported.length, 2);
  await nav(page, '我的單字庫');
  await page.getByRole('searchbox').fill('演算法');
  assert.ok((await page.locator('.word-row').count()) > 0);
  await page.getByRole('searchbox').fill('no-such-word');
  await page.getByText('沒有符合的單字').waitFor();
  await page.getByRole('searchbox').fill('');
  await audit(page, 'SRS word library');
  check('existing import, duplicate handling, malformed lines, search and custom-word persistence');

  await nav(page, '單字學習');
  const srsBeforeQuiz = JSON.stringify((await saved(page)).srs);
  await chooseQuiz(page, '四選一測驗');
  await audit(page, 'multiple-choice question');
  const seen = [];
  for (let index = 0; index < 5; index++) {
    const run = (await saved(page)).activeQuiz;
    const question = run.questions[run.index];
    assert.ok(!seen.includes(question.id));
    seen.push(question.id);
    const answers = page.locator('.quiz-option');
    const labels = await answers.allTextContents();
    const correct = labels.findIndex((label) => label.slice(1) === question.translation);
    assert.ok(correct >= 0);
    await answers.nth(index === 0 ? (correct + 1) % labels.length : correct).click();
    assert.equal(await page.locator('.quiz-option.correct').count(), 1);
    if (index === 0) await audit(page, 'multiple-choice incorrect feedback');
    await page
      .getByRole('button', { name: index === 4 ? '查看成績' : '下一題', exact: true })
      .click();
  }
  assert.equal(await page.locator('.score-display').innerText(), '80%');
  assert.equal((await saved(page)).quizHistory.length, 1);
  assert.equal(JSON.stringify((await saved(page)).srs), srsBeforeQuiz);
  assert.equal((await saved(page)).practice.algorithm.needsPractice, true);
  await page.reload();
  await page.getByRole('button', { name: '考我單詞', exact: true }).click();
  await page.locator('#quiz-result').waitFor();
  assert.equal((await saved(page)).quizHistory.length, 1);
  check(
    'multiple-choice regression, distinct questions, actual score, saved history and no implicit SRS rating',
  );

  await chooseQuiz(page, '拼字測驗');
  await audit(page, 'spelling question');
  await page.locator('#quiz-answer').fill('  ALGORITHM  ');
  await page.locator('#quiz-answer').press('Enter');
  assert.equal((await saved(page)).activeQuiz.score, 1);
  await page.locator('#quiz-answer').press('Enter');
  // Enter on an answered field intentionally advances once; refreshing must preserve that step.
  assert.equal((await saved(page)).activeQuiz.index, 1);
  await page.reload();
  await page.getByRole('button', { name: '考我單詞', exact: true }).click();
  await page.locator('#quiz-answer').waitFor();
  assert.equal((await saved(page)).activeQuiz.index, 1);
  assert.equal((await saved(page)).activeQuiz.score, 1);
  for (let index = 1; index < 5; index++) {
    const run = (await saved(page)).activeQuiz;
    const question = run.questions[run.index];
    await page
      .locator('#quiz-answer')
      .fill(index === 2 ? 'unrelated answer' : question.word.toUpperCase().replaceAll(' ', '   '));
    await page.getByRole('button', { name: '送出答案', exact: true }).evaluate((button) => {
      button.click();
      button.click();
    });
    const answered = (await saved(page)).activeQuiz;
    assert.equal(answered.answers.length, index + 1);
    if (index === 2) {
      assert.equal(answered.answers.at(-1).correct, false);
      await audit(page, 'spelling incorrect feedback');
    }
    await page
      .getByRole('button', { name: index === 4 ? '查看成績' : '下一題', exact: true })
      .click();
  }
  assert.equal(await page.locator('.score-display').innerText(), '80%');
  assert.equal((await saved(page)).quizHistory.length, 2);
  assert.equal(JSON.stringify((await saved(page)).srs), srsBeforeQuiz);
  await audit(page, 'spelling results');
  check(
    'spelling case/phrase normalization, Enter, duplicate submission guard and refresh without double scoring',
  );

  await chooseQuiz(page, '聽力測驗');
  await page.locator('#quiz-answer').waitFor();
  let listening = (await saved(page)).activeQuiz;
  assert.equal(
    (await page.locator('body').innerText()).includes(listening.questions[0].word),
    false,
  );
  assert.ok((await page.evaluate(() => window.__spoken)).some((item) => item.text === 'algorithm'));
  await page.getByLabel('播放速度', { exact: false }).selectOption('0.65');
  await page.getByRole('button', { name: '播放／重新播放' }).click();
  assert.equal((await page.evaluate(() => window.__spoken)).at(-1).rate, 0.65);
  assert.equal((await saved(page)).activeQuiz.answers.length, 0);
  await audit(page, 'listening question with hidden answer');
  await page.screenshot({
    path: resolve(output, 'upgrade-listening.png'),
    fullPage: true,
    animations: 'disabled',
  });
  for (let index = 0; index < 5; index++) {
    const run = (await saved(page)).activeQuiz;
    await page.locator('#quiz-answer').fill(run.questions[run.index].word);
    await page.getByRole('button', { name: '送出答案', exact: true }).click();
    await page
      .getByRole('button', { name: index === 4 ? '查看成績' : '下一題', exact: true })
      .click();
  }
  assert.equal(await page.locator('.score-display').innerText(), '100%');
  assert.equal((await saved(page)).quizHistory.length, 3);
  assert.equal(JSON.stringify((await saved(page)).srs), srsBeforeQuiz);
  assert.ok(await page.evaluate(() => window.__cancelled > 5));
  check(
    'listening hides the answer, selects voice, replays at selected speed, cancels audio, and never scores playback',
  );
  await nav(page, '待複習單字');
  assert.ok(
    (await page.locator('.word-row').allTextContents()).some((text) => text.includes('algorithm')),
  );
  await audit(page, 'practice and due review list');
  await nav(page, '學習紀錄');
  assert.equal(await page.locator('.dashboard-metric').count(), 6);
  assert.match(await page.locator('.history-table').innerText(), /拼字測驗/);
  assert.match(
    await page.locator('.dashboard-metric').filter({ hasText: '已熟悉單字' }).innerText(),
    /0/,
  );
  await audit(page, 'real-data dashboard');
  await page.screenshot({
    path: resolve(output, 'upgrade-statistics.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const beforeClear = await saved(page);
  await page.locator('.import-nav').click();
  await page.getByRole('button', { name: '清除匯入', exact: true }).click();
  const afterClear = await saved(page);
  assert.equal(afterClear.imported.length, 0);
  assert.deepEqual(afterClear.srs, beforeClear.srs);
  assert.deepEqual(afterClear.progress, beforeClear.progress);
  check('real dashboard, quiz practice flags, and clearing imports preserves original scheduling');

  const finishContext = await context();
  const finish = await tracked(finishContext);
  await finish.goto(base);
  for (let index = 0; index < 23; index++) {
    await finish.locator('.reveal-button').click();
    await finish.locator('.srs-rating.good').click();
    if (index < 22) await finish.waitForTimeout(360);
  }
  await finish.getByText('今天的待學單字，完成了！').waitFor();
  assert.equal((await saved(finish)).reviewSession.queue.length, 0);
  assert.equal((await saved(finish)).reviewEvents.length, 23);
  await finish.reload();
  await finish.getByText('今天的待學單字，完成了！').waitFor();
  await audit(finish, 'SRS completion and future scheduling');
  await finish.getByRole('button', { name: '自由練習全部單字', exact: true }).click();
  assert.equal((await saved(finish)).reviewSession.queue.length, 23);
  check(
    'all 23 cards complete, future reviews stay out of the due queue, and completion survives reload',
  );

  const migrationContext = await context();
  const legacy = {
    version: 1,
    imported: [{ word: 'legacy term', translation: '既有單字' }],
    progress: {
      algorithm: { status: 'known', seen: 2, forgotten: 0 },
      'data structure': { status: 'review', seen: 2, forgotten: 1 },
    },
    session: null,
    quizHistory: [],
  };
  await migrationContext.addInitScript(
    (value) => localStorage.setItem('ytp-vocabuddy:v1', JSON.stringify(value)),
    legacy,
  );
  const migrated = await tracked(migrationContext);
  await migrated.goto(base);
  await migrated.locator('#current-word').waitFor();
  const migratedState = await saved(migrated);
  assert.equal(migratedState.version, 2);
  assert.deepEqual(migratedState.progress, legacy.progress);
  assert.deepEqual(migratedState.imported, legacy.imported);
  assert.equal(
    await migrated.evaluate(() => Boolean(localStorage.getItem('ytp-vocabuddy:v1'))),
    true,
  );
  await migrated.reload();
  await migrated.locator('#current-word').waitFor();
  assert.deepEqual((await saved(migrated)).srs, migratedState.srs);
  check(
    'legacy v1 migration preserves imported words, old familiar/forgotten state, and the original storage key',
  );

  const aiContext = await context({ permissions: ['clipboard-read', 'clipboard-write'] });
  let aiCalls = 0;
  await aiContext.route('**/api/examples/status', (route) =>
    route.fulfill({ json: { available: true, modelVersion: 'mock-model' } }),
  );
  await aiContext.route('**/api/examples', async (route) => {
    aiCalls++;
    const request = route.request().postDataJSON();
    await route.fulfill({
      json: {
        english: `This ${request.word} helps us plan the route.`,
        translation: '這個演算法能幫助我們規劃路線。',
        explanation: '這個字在此情境中表示解決問題的步驟。',
        notes: ['這是自動化測試的模擬回應。'],
        modelVersion: 'mock-model',
      },
    });
  });
  const aiPage = await tracked(aiContext);
  await aiPage.goto(base);
  await aiPage.getByRole('button', { name: 'AI 例句', exact: true }).click();
  await aiPage.locator('.example-english').waitFor();
  assert.equal(aiCalls, 1);
  await aiPage.getByRole('button', { name: '複製例句' }).click();
  await aiPage.getByText('已複製例句與翻譯。').waitFor();
  await aiPage.getByRole('button', { name: '收合 AI 例句' }).click();
  await aiPage.getByRole('button', { name: 'AI 例句', exact: true }).click();
  await aiPage.locator('.example-english').waitFor();
  assert.equal(aiCalls, 1);
  await aiPage.getByLabel('使用情境').selectOption('academic');
  await aiPage.getByLabel('英文難度').selectOption('advanced');
  await aiPage.getByRole('button', { name: '取得例句', exact: true }).click();
  await aiPage.locator('.example-english').waitFor();
  assert.equal(aiCalls, 2);
  await aiPage.getByRole('button', { name: '重新產生', exact: true }).click();
  await aiPage.locator('.example-english').waitFor();
  assert.equal(aiCalls, 3);
  await audit(aiPage, 'AI contextual example with cached content');
  await aiPage.clock.install();
  await aiContext.setOffline(true);
  await aiPage.clock.fastForward(31000);
  await aiPage.getByRole('button', { name: '收合 AI 例句' }).click();
  await aiPage.getByRole('button', { name: 'AI 例句', exact: true }).click();
  // Reopening defaults to the cached everyday/intermediate request.
  await aiPage.locator('.example-english').waitFor();
  assert.equal(aiCalls, 3);
  assert.match(await aiPage.locator('.example-actions').innerText(), /已快取/);
  await aiContext.setOffline(false);
  await aiPage.clock.resume();
  check('mocked contextual AI, copy, cache reuse, regeneration and offline cached examples');

  const mobileContext = await context({ viewport: { width: 390, height: 844 } });
  const mobile = await tracked(mobileContext);
  await mobile.goto(base);
  await mobile.locator('#current-word').waitFor();
  for (const width of [320, 390, 768, 1024]) {
    await mobile.setViewportSize({ width, height: 900 });
    await mobile.waitForTimeout(300);
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `overflow at ${width}`,
    );
  }
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.waitForTimeout(300);
  await audit(mobile, 'mobile SRS');
  await mobile.screenshot({
    path: resolve(output, 'upgrade-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await mobile.getByRole('button', { name: '開啟導覽選單' }).click();
  await mobile.keyboard.press('Escape');
  assert.notEqual(await mobile.locator('.sidebar').getAttribute('inert'), null);
  await nav(mobile, '我的單字庫');
  await mobile.getByRole('searchbox').fill('graph');
  assert.ok((await mobile.locator('.word-row').count()) > 0);
  await nav(mobile, '單字學習');
  await mobile.getByRole('button', { name: '考我單詞', exact: true }).click();
  await audit(mobile, 'mobile quiz selection');
  await mobile.getByRole('button', { name: '開始拼字測驗', exact: true }).click();
  await audit(mobile, 'mobile spelling');
  check('responsive widths, mobile navigation, Escape, search and quiz accessibility');

  const fallbackContext = await context();
  await fallbackContext.addInitScript(() =>
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined }),
  );
  const fallback = await tracked(fallbackContext);
  await fallback.goto(base);
  await fallback.getByRole('button', { name: '考我單詞', exact: true }).click();
  assert.equal(
    await fallback.getByRole('button', { name: '開始聽力測驗', exact: true }).isDisabled(),
    true,
  );
  await fallback.getByText('此瀏覽器不支援語音，請選擇其他模式。').waitFor();
  const brokenContext = await context();
  await brokenContext.addInitScript(() => {
    localStorage.setItem('ytp-vocabuddy:v2', 'broken');
    localStorage.setItem('ytp-vocabuddy:v1', 'broken');
  });
  const broken = await tracked(brokenContext);
  await broken.goto(base);
  await broken.locator('#current-word').waitFor();
  const blockedContext = await context();
  await blockedContext.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw Error('blocked');
    };
    Storage.prototype.setItem = () => {
      throw Error('quota');
    };
  });
  const blocked = await tracked(blockedContext);
  await blocked.goto(base);
  await blocked.locator('.storage-warning').waitFor();
  await blocked.locator('.reveal-button').click();
  await blocked.locator('.srs-rating.good').click();
  await blocked.waitForFunction(
    () => document.querySelector('#current-word')?.textContent === 'data structure',
  );
  check('unsupported speech, corrupted storage, and blocked localStorage remain usable');
  assert.deepEqual(errors, []);
  const report = { checks, audits, browserErrors: errors, at: new Date().toISOString() };
  writeFileSync(resolve(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  const violations = audits.flatMap((a) => a.violations);
  console.log(
    'RESULT',
    JSON.stringify({
      flows: checks.length,
      audits: audits.length,
      accessibilityViolations: violations.length,
      browserErrors: errors.length,
    }),
  );
  if (violations.length) process.exitCode = 2;
} catch (error) {
  if (page)
    await page
      .screenshot({ path: resolve(output, 'failure.png'), fullPage: true, animations: 'disabled' })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
