import {
  PROMPT_VERSION,
  validateExampleInput,
  validateExampleOutput,
} from '../lib/example-contract.js';
export const EXAMPLE_CACHE_KEY = 'ytp-vocabuddy:examples:v1';
const baseKey = (request) =>
  JSON.stringify([
    request.wordId,
    request.word,
    request.translation,
    request.context,
    request.difficulty,
    PROMPT_VERSION,
  ]);
export function createExampleClient({
  fetchImpl = globalThis.fetch,
  storage,
  endpoint = '/api/examples',
  timeoutMs = 15000,
  now = Date.now,
} = {}) {
  let statusValue = null,
    statusAt = 0;
  const pending = new Map();
  const getStorage = () => (storage === undefined ? globalThis.localStorage : storage);
  const readCache = () => {
    try {
      const value = JSON.parse(getStorage()?.getItem(EXAMPLE_CACHE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  async function jsonRequest(url, options = {}, signal) {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { ...options, signal: controller.signal });
          const data = await response.json();
          if (!response.ok)
            throw new Error(
              typeof data?.error === 'string' ? data.error : '例句服務暫時無法使用。',
            );
          return data;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort('timeout');
            reject(new Error('例句服務回應逾時，請稍後再試。'));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (signal?.aborted) throw new DOMException('已取消例句請求。', 'AbortError');
      if (error instanceof TypeError) throw new Error('目前無法連線，已快取的例句仍可使用。');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
  async function status({ refresh = false } = {}) {
    if (!refresh && statusValue && now() - statusAt < 30000) return statusValue;
    try {
      const value = await jsonRequest(`${endpoint}/status`);
      statusValue = {
        available: value.available === true,
        modelVersion: typeof value.modelVersion === 'string' ? value.modelVersion : 'unconfigured',
        promptVersion: PROMPT_VERSION,
      };
    } catch {
      statusValue = {
        available: false,
        offline: true,
        modelVersion: null,
        promptVersion: PROMPT_VERSION,
      };
    }
    statusAt = now();
    return statusValue;
  }
  async function get(input, { regenerate = false, signal } = {}) {
    const request = validateExampleInput({ ...input, promptVersion: PROMPT_VERSION });
    const service = await status();
    if (signal?.aborted) throw new DOMException('已取消例句請求。', 'AbortError');
    const base = baseKey(request);
    const cache = readCache()
      .filter(
        (item) =>
          item?.base === base &&
          typeof item.modelVersion === 'string' &&
          (!service.available || item.modelVersion === service.modelVersion),
      )
      .sort((a, b) => b.at - a.at);
    if (!regenerate)
      for (const item of cache) {
        try {
          return {
            ...validateExampleOutput(item.value, request),
            cached: true,
            modelVersion: item.modelVersion,
            promptVersion: PROMPT_VERSION,
            available: service.available,
          };
        } catch {
          /* Ignore one damaged cache entry. */
        }
      }
    if (!service.available) return { unavailable: true, offline: service.offline === true };
    const key = JSON.stringify([base, service.modelVersion]);
    const existing = pending.get(key);
    if (existing && !existing.signal?.aborted) return existing.promise;
    const promise = (async () => {
      const response = await jsonRequest(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
        signal,
      );
      const value = validateExampleOutput(response, request);
      const modelVersion =
        typeof response.modelVersion === 'string' ? response.modelVersion : service.modelVersion;
      const entries = readCache().filter(
        (item) => !(item?.base === base && item.modelVersion === modelVersion),
      );
      entries.push({ base, modelVersion, at: now(), value });
      let cacheWarning = '';
      try {
        getStorage()?.setItem(EXAMPLE_CACHE_KEY, JSON.stringify(entries.slice(-100)));
      } catch {
        cacheWarning = '例句已取得，但瀏覽器暫時無法快取，離線時可能無法開啟。';
      }
      return {
        ...value,
        cached: false,
        modelVersion,
        promptVersion: PROMPT_VERSION,
        available: true,
        cacheWarning,
      };
    })();
    pending.set(key, { promise, signal });
    try {
      return await promise;
    } finally {
      if (pending.get(key)?.promise === promise) pending.delete(key);
    }
  }
  return { status, get };
}
const client = createExampleClient({
  endpoint: import.meta.env?.VITE_EXAMPLE_ENDPOINT || '/api/examples',
});
export const getExample = (input, options) => client.get(input, options);
export const getExampleStatus = (options) => client.status(options);
