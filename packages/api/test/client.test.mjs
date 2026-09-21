import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createClient,
  routes,
  buildPath,
  buildQuery,
  getResponseMeta,
  isNotModified,
  BroadcastwellApiError,
  DEMO_KEY,
  SAMPLE_ACCOUNT,
  ENGINES,
  ENGINE_IDS,
  DEFAULT_BASE_URL,
} from '../src/index.mjs';

const KEY = 'bwp_' + 'a'.repeat(64);

function json(body, status = 200, headers = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
      ...headers,
    },
  });
}

function fakeFetch(responder) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init, calls.length);
  };
  fn.calls = calls;
  return fn;
}

test('routes table covers every OpenAPI operation', () => {
  const names = Object.keys(routes).sort();
  assert.deepEqual(names, [
    'compareRuns', 'getAccount', 'getHistory', 'getMe', 'getMethod', 'getProof', 'getQuestion',
    'getReceipt', 'getRun', 'getRunSummary', 'listAlerts', 'listDisplacement', 'listFixes',
    'listProof', 'listQuestions', 'listReceipts', 'listRunFixes', 'listRuns', 'listSources',
  ]);
  assert.equal(routes.listReceipts.path, '/accounts/{account}/runs/{run}/receipts');
  assert.deepEqual(
    routes.listReceipts.queryParams.map((q) => q.name),
    ['question_id', 'engine', 'pass_id', 'verdict', 'limit', 'cursor'],
  );
  assert.equal(routes.getMethod.auth, false);
  assert.equal(routes.listRuns.paged, true);
  assert.equal(routes.listFixes.paged, false);
  assert.equal(routes.listFixes.returns, 'array');
});

test('engine labels are exact', () => {
  assert.deepEqual(ENGINE_IDS, ['chatgpt', 'claude', 'perplexity', 'google_aio', 'google_ai_mode']);
  assert.deepEqual(Object.values(ENGINES), [
    'ChatGPT', 'Claude', 'Perplexity', 'Google AI Overviews', 'Google AI Mode',
  ]);
});

test('buildPath encodes path parameters and rejects missing ones', () => {
  assert.equal(
    buildPath('getReceipt', { account: 'sample', run: 'baseline-kalvenor-v11', receipt: 'a/b c' }),
    '/accounts/sample/runs/baseline-kalvenor-v11/receipts/a%2Fb%20c',
  );
  assert.throws(() => buildPath('getRun', { account: 'me' }), /needs the run parameter/);
  assert.throws(() => buildPath('nope', {}), /Unknown Broadcastwell route/);
});

test('buildQuery keeps only declared, non empty parameters, in route order', () => {
  const q = buildQuery('listReceipts', {
    run: 'x',
    verdict: 'not_named',
    engine: 'google_ai_mode',
    question_id: 7,
    pass_id: 'run 1&2',
    limit: 100,
    cursor: '',
    unknown: 'dropped',
  });
  assert.equal(q, '?question_id=7&engine=google_ai_mode&pass_id=run%201%262&verdict=not_named&limit=100');
  assert.equal(buildQuery('getMe', { a: 1 }), '');
});

test('sends bearer auth, accept and user agent; defaults account to me', async () => {
  const f = fakeFetch(() => json({ data: [], pagination: { limit: 25, next_cursor: null, total: 0 } }));
  const client = createClient({ apiKey: KEY, fetch: f, userAgent: 'test-agent/1' });
  assert.equal(client.account, 'me');
  assert.equal(client.baseUrl, DEFAULT_BASE_URL);
  await client.listRuns({ limit: 5 });
  const [{ url, init }] = f.calls;
  assert.equal(url, DEFAULT_BASE_URL + '/accounts/me/runs?limit=5');
  assert.equal(init.method, 'GET');
  assert.equal(init.headers.authorization, 'Bearer ' + KEY);
  assert.equal(init.headers.accept, 'application/json');
  assert.equal(init.headers['user-agent'], 'test-agent/1');
});

test('demo key defaults the account to sample; method route sends no key', async () => {
  const f = fakeFetch(() => json({ data: {} }));
  const client = createClient({ apiKey: DEMO_KEY, fetch: f, baseUrl: 'https://example.test/api/v1/' });
  assert.equal(client.account, SAMPLE_ACCOUNT);
  await client.getRunSummary({ run: 'r1' });
  await client.getMethod();
  await client.getAccount({ account: 'me' });
  assert.equal(f.calls[0].url, 'https://example.test/api/v1/accounts/sample/runs/r1/summary');
  assert.equal(f.calls[1].url, 'https://example.test/api/v1/method');
  assert.equal(f.calls[1].init.headers.authorization, undefined);
  assert.equal(f.calls[2].url, 'https://example.test/api/v1/accounts/me');
});

test('paginate follows next_cursor until null', async () => {
  const pages = {
    '': { data: [1, 2], pagination: { limit: 2, next_cursor: 'c2', total: 5 } },
    c2: { data: [3, 4], pagination: { limit: 2, next_cursor: 'c3', total: 5 } },
    c3: { data: [5], pagination: { limit: 2, next_cursor: null, total: 5 } },
  };
  const f = fakeFetch((url) => json(pages[new URL(url).searchParams.get('cursor') || '']));
  const client = createClient({ apiKey: KEY, fetch: f });
  const items = [];
  for await (const item of client.paginate('listSources', { run: 'r', limit: 2 })) items.push(item);
  assert.deepEqual(items, [1, 2, 3, 4, 5]);
  assert.equal(f.calls.length, 3);
  assert.match(f.calls[1].url, /\/accounts\/me\/runs\/r\/sources\?limit=2&cursor=c2$/);
});

test('paginate respects maxItems and refuses routes that do not page', async () => {
  const f = fakeFetch(() => json({ data: [1, 2, 3], pagination: { limit: 3, next_cursor: 'again', total: 9 } }));
  const client = createClient({ apiKey: KEY, fetch: f });
  const items = [];
  for await (const item of client.paginate('listAlerts', {}, { maxItems: 4 })) items.push(item);
  assert.deepEqual(items, [1, 2, 3, 1]);
  await assert.rejects(async () => {
    for await (const _ of client.paginate('listFixes')) void _;
  }, /does not page/);
});

test('paginate stops if the server repeats a cursor', async () => {
  const f = fakeFetch(() => json({ data: [1], pagination: { limit: 1, next_cursor: 'same', total: 9 } }));
  const client = createClient({ apiKey: KEY, fetch: f });
  const items = [];
  for await (const item of client.paginate('listRuns')) items.push(item);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(items, [1, 1]);
});

for (const [status, code] of [
  [401, 'unauthorized'],
  [401, 'key_revoked'],
  [404, 'not_found'],
  [409, 'run_not_delivered'],
]) {
  test(`problem details become BroadcastwellApiError (${status} ${code})`, async () => {
    const f = fakeFetch(() =>
      json({ type: 'about:blank', title: 'T', status, code, detail: 'Next step: check the id.' }, status),
    );
    const client = createClient({ apiKey: KEY, fetch: f });
    await assert.rejects(client.getRun({ run: 'x' }), (err) => {
      assert.ok(err instanceof BroadcastwellApiError);
      assert.equal(err.status, status);
      assert.equal(err.code, code);
      assert.equal(err.detail, 'Next step: check the id.');
      assert.equal(err.retryAfter, null);
      assert.match(err.url, /\/accounts\/me\/runs\/x$/);
      return true;
    });
  });
}

test('non JSON error bodies still produce a useful error', async () => {
  const f = fakeFetch(() => new Response('upstream broke', { status: 502 }));
  const client = createClient({ apiKey: KEY, fetch: f });
  await assert.rejects(client.getMe(), (err) => err.status === 502 && err.code === 'http_502' && err.detail === 'upstream broke');
});

test('network failures become status 0 errors', async () => {
  const client = createClient({ apiKey: KEY, fetch: async () => { throw new Error('ECONNRESET'); } });
  await assert.rejects(client.getMe(), (err) => err.status === 0 && err.code === 'network_error');
});

test('429 is retried once after Retry-After', async () => {
  const slept = [];
  const f = fakeFetch((url, init, n) =>
    n === 1
      ? json({ status: 429, code: 'rate_limited', detail: 'Slow down.' }, 429, { 'retry-after': '3' })
      : json({ data: { ok: true } }),
  );
  const client = createClient({ apiKey: KEY, fetch: f, sleep: async (ms) => { slept.push(ms); } });
  const body = await client.getMe();
  assert.deepEqual(body, { data: { ok: true } });
  assert.deepEqual(slept, [3000]);
  assert.equal(f.calls.length, 2);
});

test('a second 429 is thrown with retryAfter', async () => {
  const f = fakeFetch(() => json({ status: 429, code: 'rate_limited', detail: 'Slow down.' }, 429, { 'retry-after': '2' }));
  const client = createClient({ apiKey: KEY, fetch: f, sleep: async () => {} });
  await assert.rejects(client.getMe(), (err) => err.status === 429 && err.code === 'rate_limited' && err.retryAfter === 2);
  assert.equal(f.calls.length, 2);
});

test('429 retry can be turned off, and long waits are not retried', async () => {
  const f = fakeFetch(() => json({ status: 429, code: 'rate_limited', detail: 'x' }, 429, { 'retry-after': '120' }));
  const off = createClient({ apiKey: KEY, fetch: f, retryOn429: false, sleep: async () => assert.fail('no sleep') });
  await assert.rejects(off.getMe(), (err) => err.retryAfter === 120);
  const longWait = createClient({ apiKey: KEY, fetch: f, sleep: async () => assert.fail('no sleep') });
  await assert.rejects(longWait.getMe(), (err) => err.status === 429);
  assert.equal(f.calls.length, 2);
});

test('ETag: meta is exposed and If-None-Match returns NotModified on 304', async () => {
  const f = fakeFetch((url, init) =>
    init.headers['if-none-match'] === '"v1"'
      ? new Response(null, { status: 304, headers: { etag: '"v1"' } })
      : json({ data: { x: 1 } }, 200, {
          etag: '"v1"',
          'ratelimit-limit': '30',
          'ratelimit-remaining': '29',
          'ratelimit-reset': '60',
        }),
  );
  const client = createClient({ apiKey: KEY, fetch: f });
  const body = await client.getMe();
  const meta = getResponseMeta(body);
  assert.equal(meta.etag, '"v1"');
  assert.deepEqual(meta.rateLimit, { limit: 30, remaining: 29, reset: 60 });
  const again = await client.getMe({}, { ifNoneMatch: meta.etag });
  assert.deepEqual(again, { notModified: true, etag: '"v1"' });
  assert.equal(isNotModified(again), true);
  assert.equal(isNotModified(body), false);
});

test('rates and counts are returned untouched', async () => {
  const summary = {
    data: {
      scheduled: {
        scored: 50,
        named: 13,
        named_rate: { pct: 26, low: 15.9, high: 39.6, interval: '15.9 to 39.6', base: '13 of 50 answers' },
      },
    },
  };
  const client = createClient({ apiKey: KEY, fetch: fakeFetch(() => json(summary)) });
  assert.deepEqual(await client.getRunSummary({ run: 'r' }), summary);
});

test('createClient validates its options', () => {
  assert.throws(() => createClient({}), /needs an apiKey/);
  assert.throws(() => createClient({ apiKey: KEY, fetch: 'nope' }), /No fetch implementation/);
});
