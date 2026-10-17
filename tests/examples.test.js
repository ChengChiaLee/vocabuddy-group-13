import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import {
  PROMPT_VERSION,
  validateExampleInput,
  validateExampleOutput,
  containsVocabulary,
} from '../src/lib/example-contract.js';
import { createExampleClient, EXAMPLE_CACHE_KEY } from '../src/services/examples.js';
import { exampleConfig, generateExample, createExampleHandler } from '../server/examples.js';

const input = {
  wordId: 'algorithm',
  word: 'algorithm',
  translation: '演算法',
  context: 'programming',
  difficulty: 'intermediate',
  promptVersion: PROMPT_VERSION,
};
const output = {
  english: 'This algorithm sorts the numbers.',
  translation: '這個演算法會將數字排序。',
  explanation: '這裡的 algorithm 表示解決問題的一組步驟。',
  notes: ['可搭配 sorting 使用。'],
};
const config = {
  available: true,
  model: 'test-model',
  apiKey: 'server-only-test-secret',
  baseUrl: 'https://example.invalid/v1',
  timeoutMs: 50,
};
const response = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const upstream = () => response({ choices: [{ message: { content: JSON.stringify(output) } }] });
const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
};

test('example input validates context, difficulty, word IDs, bounds, control characters, and extra fields', () => {
  assert.deepEqual(validateExampleInput(input), input);
  for (const bad of [
    { ...input, context: 'unknown' },
    { ...input, difficulty: 'unknown' },
    { ...input, wordId: 'wrong' },
    { ...input, word: 'a'.repeat(121) },
    { ...input, word: 'a\nb' },
    { ...input, apiKey: 'never accepted' },
    null,
  ])
    assert.throws(() => validateExampleInput(bad));
});
test('example validation checks whole phrases and structured Traditional Chinese fields', () => {
  assert.deepEqual(validateExampleOutput(output, input), output);
  assert.equal(containsVocabulary('Please do not give up.', 'give up'), true);
  assert.equal(containsVocabulary('They gave up.', 'give up'), false);
  assert.equal(containsVocabulary('The governor spoke.', 'Go'), false);
  assert.equal(containsVocabulary('We should go now.', 'Go'), true);
  assert.throws(() => validateExampleOutput({ ...output, english: 'Unrelated sentence.' }, input));
  assert.throws(() => validateExampleOutput({ ...output, explanation: '' }, input));
  assert.throws(() => validateExampleOutput({ ...output, translation: 'No Chinese' }, input));
  assert.throws(() => validateExampleOutput({ ...output, notes: 'invalid' }, input));
});
test('provider configuration is server-only, optional, and requires an explicit model', () => {
  assert.equal(exampleConfig({}).available, false);
  assert.equal(exampleConfig({ AI_PROVIDER: 'openai', AI_API_KEY: 'key' }).available, false);
  assert.equal(
    exampleConfig({ AI_PROVIDER: 'openai', AI_API_KEY: 'key', AI_MODEL: 'configured-model' })
      .available,
    true,
  );
  assert.equal(
    exampleConfig({
      AI_PROVIDER: 'openai',
      AI_API_KEY: 'key',
      AI_MODEL: 'model',
      AI_BASE_URL: 'http://unsafe.example',
    }).available,
    false,
  );
});
test('mocked AI adapter sends a structured schema and validates output without logging credentials', async () => {
  let called = 0;
  const result = await generateExample(input, {
    config,
    fetchImpl: async (url, options) => {
      called++;
      assert.equal(url, 'https://example.invalid/v1/chat/completions');
      assert.equal(options.headers.Authorization, `Bearer ${config.apiKey}`);
      const body = JSON.parse(options.body);
      assert.equal(body.response_format.json_schema.strict, true);
      assert.equal(body.max_completion_tokens, 1200);
      assert.equal(body.model, 'test-model');
      return upstream();
    },
  });
  assert.equal(called, 1);
  assert.equal(result.english, output.english);
  assert.equal(result.modelVersion, 'test-model');
});
test('missing configuration never calls an upstream provider', async () => {
  let called = false;
  await assert.rejects(
    generateExample(input, {
      config: exampleConfig({}),
      fetchImpl: async () => {
        called = true;
      },
    }),
    /尚未設定/,
  );
  assert.equal(called, false);
});
test('AI adapter handles malformed output, provider errors, network failure, and a controllable timeout', async () => {
  await assert.rejects(
    generateExample(input, { config, fetchImpl: async () => response({ choices: [] }) }),
  );
  await assert.rejects(
    generateExample(input, { config, fetchImpl: async () => response({}, 401) }),
    /暫時無法使用/,
  );
  await assert.rejects(
    generateExample(input, {
      config,
      fetchImpl: async () => {
        throw new TypeError('network');
      },
    }),
  );
  await assert.rejects(
    generateExample(input, {
      config: { ...config, timeoutMs: 10 },
      fetchImpl: () => new Promise(() => {}),
    }),
    /逾時/,
  );
});
test('client caches by word/context/difficulty/prompt/model and regeneration bypasses cache', async () => {
  const storage = memory();
  let calls = 0;
  let model = 'model-one';
  const client = createExampleClient({
    storage,
    fetchImpl: async (url) =>
      url.endsWith('/status')
        ? response({ available: true, modelVersion: model })
        : (calls++, response({ ...output, modelVersion: model })),
  });
  assert.equal((await client.get(input)).cached, false);
  assert.equal((await client.get(input)).cached, true);
  assert.equal(calls, 1);
  await client.get({ ...input, context: 'everyday' });
  assert.equal(calls, 2);
  await client.get({ ...input, difficulty: 'basic' });
  assert.equal(calls, 3);
  await client.get(input, { regenerate: true });
  assert.equal(calls, 4);
  model = 'model-two';
  await client.status({ refresh: true });
  await client.get(input);
  assert.equal(calls, 5);
  const cache = JSON.parse(storage.getItem(EXAMPLE_CACHE_KEY));
  assert.equal(cache.length, 4);
  assert.ok(cache.every((item) => item.base.includes(PROMPT_VERSION)));
});
test('cached examples remain available offline, while unconfigured requests never create fake content', async () => {
  const storage = memory();
  const online = createExampleClient({
    storage,
    fetchImpl: async (url) =>
      url.endsWith('/status')
        ? response({ available: true, modelVersion: 'test' })
        : response({ ...output, modelVersion: 'test' }),
  });
  await online.get(input);
  const offline = createExampleClient({
    storage,
    fetchImpl: async () => {
      throw new TypeError('offline');
    },
  });
  const cached = await offline.get(input);
  assert.equal(cached.cached, true);
  assert.equal(cached.available, false);
  assert.equal(cached.english, output.english);
  const unavailable = await offline.get({ ...input, context: 'exam' });
  assert.equal(unavailable.unavailable, true);
  assert.equal(unavailable.english, undefined);
});
test('concurrent requests share one provider call and failed/invalid replies are never cached', async () => {
  let calls = 0;
  const storage = memory();
  let release;
  const client = createExampleClient({
    storage,
    fetchImpl: async (url) =>
      url.endsWith('/status')
        ? response({ available: true, modelVersion: 'test' })
        : (calls++,
          await new Promise((resolve) => {
            release = () => resolve(response({ ...output, modelVersion: 'test' }));
          })),
  });
  await client.status();
  const a = client.get(input),
    b = client.get(input);
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  const badStorage = memory();
  const bad = createExampleClient({
    storage: badStorage,
    fetchImpl: async (url) =>
      url.endsWith('/status')
        ? response({ available: true, modelVersion: 'test' })
        : response({ english: 'bad' }),
  });
  await assert.rejects(bad.get(input));
  assert.equal(badStorage.getItem(EXAMPLE_CACHE_KEY), null);
});
test('client reports timeouts and cache quota errors without breaking a valid generated example', async () => {
  const client = createExampleClient({
    timeoutMs: 10,
    storage: memory(),
    fetchImpl: async (url) =>
      url.endsWith('/status')
        ? response({ available: true, modelVersion: 'test' })
        : new Promise(() => {}),
  });
  await assert.rejects(client.get(input), /逾時/);
  const quota = createExampleClient({
    storage: {
      getItem: () => null,
      setItem: () => {
        throw Error('quota');
      },
    },
    fetchImpl: async (url) =>
      url.endsWith('/status')
        ? response({ available: true, modelVersion: 'test' })
        : response(output),
  });
  const result = await quota.get(input);
  assert.equal(result.english, output.english);
  assert.ok(result.cacheWarning);
});

async function withServer(options, fn) {
  const server = createServer(createExampleHandler(options));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
test('HTTP adapter enforces method, content type, origin, input size, and per-client limits', async () => {
  await withServer({ config, fetchImpl: async () => upstream(), maxPerMinute: 1 }, async (base) => {
    const status = await fetch(`${base}/status`);
    const statusText = await status.text();
    assert.equal(status.status, 200);
    assert.ok(!statusText.includes(config.apiKey));
    assert.equal((await fetch(base)).status, 405);
    const untrustedStatus = await new Promise((resolve, reject) => {
      const request = httpRequest(base, { headers: { Host: 'untrusted.invalid' } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(untrustedStatus, 403);
    assert.equal((await fetch(base, { method: 'POST', body: '{}' })).status, 415);
    assert.equal(
      (
        await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json-invalid' },
          body: '{}',
        })
      ).status,
      415,
    );
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    };
    assert.equal(
      (
        await fetch(base, {
          ...options,
          headers: { ...options.headers, Origin: 'https://other.invalid' },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(base, { ...options, body: 'invalid json' })).status, 400);
    assert.equal((await fetch(base, { ...options, body: 'x'.repeat(5000) })).status, 413);
    const first = await fetch(base, options);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).english, output.english);
    const second = await fetch(base, options);
    assert.equal(second.status, 429);
    assert.equal(second.headers.get('retry-after'), '60');
  });
});
test('concurrent HTTP requests cannot exceed the provider concurrency allowance', async () => {
  let started,
    release,
    calls = 0;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  await withServer(
    {
      config: { ...config, timeoutMs: 1000 },
      maxConcurrent: 1,
      fetchImpl: async () => {
        calls++;
        started();
        await new Promise((resolve) => {
          release = resolve;
        });
        return upstream();
      },
    },
    async (base) => {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      };
      const first = fetch(base, options);
      await entered;
      const second = await fetch(base, options);
      assert.equal(second.status, 429);
      assert.equal(calls, 1);
      release();
      assert.equal((await first).status, 200);
    },
  );
});
