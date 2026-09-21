import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Broadcastwell,
  BroadcastwellApi,
  NodeApiError,
  executeContext,
  generated,
  json,
  nodeModule,
  transport,
} from './helpers.mjs';

const KEY = 'bwp_' + 'b'.repeat(64);
const BASE = 'https://app.broadcastwell.com/api/v1';
const creds = (apiKey = KEY, baseUrl = BASE) => ({ apiKey, baseUrl });
const node = new Broadcastwell();

async function run(params, { http, credentials = creds(), items, continueOnFail } = {}) {
  const ctx = executeContext({
    params,
    credentials,
    http: http || (async () => json({ data: {} })),
    items,
    continueOnFail,
  });
  const out = await node.execute.call(ctx);
  return { out: out[0], calls: ctx.calls };
}

test('every resource and operation maps to a route from the shared table', () => {
  const { OPERATION_ROUTES } = nodeModule;
  const routeNames = Object.keys(generated.ROUTES).sort();
  assert.deepEqual([...new Set(Object.values(OPERATION_ROUTES))].sort(), routeNames);
  const props = node.description.properties;
  for (const key of Object.keys(OPERATION_ROUTES)) {
    const [resource, operation] = key.split(':');
    const opProp = props.find((p) => p.name === 'operation' && p.displayOptions.show.resource.includes(resource));
    assert.ok(opProp, `operation list for ${resource}`);
    assert.ok(opProp.options.some((o) => o.value === operation), `${key} is offered`);
  }
});


const cases = [
  [{ resource: 'account', operation: 'getKey' }, '/me', {}],
  [{ resource: 'method', operation: 'get' }, '/method', {}],
  [{ resource: 'account', operation: 'get', account: 'me' }, '/accounts/me', {}],
  [{ resource: 'run', operation: 'get', account: 'me', run: 'r1' }, '/accounts/me/runs/r1', {}],
  [{ resource: 'run', operation: 'getSummary', account: 'acc_9', run: 'r1' }, '/accounts/acc_9/runs/r1/summary', {}],
  [{ resource: 'run', operation: 'compare', account: 'me', run: 'r1', other: 'r 2' }, '/accounts/me/runs/r1/compare/r%202', {}],
  [{ resource: 'question', operation: 'get', account: 'me', run: 'r1', question: 7 }, '/accounts/me/runs/r1/questions/7', {}],
  [{ resource: 'receipt', operation: 'get', account: 'me', run: 'r1', receipt: 'obs/1' }, '/accounts/me/runs/r1/receipts/obs%2F1', {}],
  [{ resource: 'fix', operation: 'getMany', account: 'me' }, '/accounts/me/fixes', {}],
  [{ resource: 'fix', operation: 'getManyForRun', account: 'me', run: 'r1' }, '/accounts/me/runs/r1/fixes', {}],
  [{ resource: 'history', operation: 'get', account: 'me', scope: 'engine' }, '/accounts/me/history', { scope: 'engine' }],
  [{ resource: 'history', operation: 'get', account: 'me', scope: 'all' }, '/accounts/me/history', {}],
  [{ resource: 'proof', operation: 'getMany', account: 'me' }, '/accounts/me/proof', {}],
  [{ resource: 'proof', operation: 'get', account: 'me', experiment: 'sample-proof-01' }, '/accounts/me/proof/sample-proof-01', {}],
];

for (const [params, path, qs] of cases) {
  test(`builds GET ${path} for ${params.resource}:${params.operation}`, async () => {
    const { calls } = await run(params);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url, BASE + path);
    assert.deepEqual(calls[0].qs, qs);
    assert.equal(calls[0].headers.Authorization, 'Bearer ' + KEY);
    assert.equal(calls[0].returnFullResponse, true);
  });
}

test('receipt filters and limit become query parameters', async () => {
  const { calls } = await run({
    resource: 'receipt',
    operation: 'getMany',
    account: 'me',
    run: 'r1',
    returnAll: false,
    limit: 10,
    filters: { engine: 'google_aio', verdict: 'not_named', question_id: 4, pass_id: 'run-1' },
  }, { http: async () => json({ data: [], pagination: { limit: 10, next_cursor: null, total: 0 } }) });
  assert.equal(calls[0].url, BASE + '/accounts/me/runs/r1/receipts');
  assert.deepEqual(calls[0].qs, { question_id: 4, engine: 'google_aio', pass_id: 'run-1', verdict: 'not_named', limit: 10 });
});

test('demo key reads me as sample; an explicit account is kept', async () => {
  const demo = creds(generated.DEMO_KEY);
  const a = await run({ resource: 'run', operation: 'get', account: 'me', run: 'r1' }, { credentials: demo });
  assert.equal(a.calls[0].url, BASE + '/accounts/sample/runs/r1');
  const b = await run({ resource: 'run', operation: 'get', account: 'other', run: 'r1' }, { credentials: demo });
  assert.equal(b.calls[0].url, BASE + '/accounts/other/runs/r1');
  const c = await run({ resource: 'run', operation: 'get', account: 'me', run: 'r1' });
  assert.equal(c.calls[0].url, BASE + '/accounts/me/runs/r1');
  assert.equal(transport.resolveAccount('  ', generated.DEMO_KEY), 'sample');
});

test('a custom base URL is honoured, trailing slash removed', async () => {
  const { calls } = await run({ resource: 'account', operation: 'getKey' }, { credentials: creds(KEY, 'https://example.test/api/v1/') });
  assert.equal(calls[0].url, 'https://example.test/api/v1/me');
});

test('Return All follows pagination.next_cursor', async () => {
  const pages = {
    undefined: { data: [{ id: 1 }, { id: 2 }], pagination: { limit: 100, next_cursor: 'c2', total: 3 } },
    c2: { data: [{ id: 3 }], pagination: { limit: 100, next_cursor: null, total: 3 } },
  };
  const { out, calls } = await run(
    { resource: 'run', operation: 'getMany', account: 'me', returnAll: true },
    { http: async (o) => json(pages[o.qs.cursor]) },
  );
  assert.deepEqual(out.map((i) => i.json.id), [1, 2, 3]);
  assert.deepEqual(calls.map((c) => c.qs), [{ limit: 100 }, { limit: 100, cursor: 'c2' }]);
  assert.deepEqual(out[0].pairedItem, { item: 0 });
});

test('Limit asks only for what it needs and stops', async () => {
  let n = 0;
  const { out, calls } = await run(
    { resource: 'source', operation: 'getMany', account: 'me', run: 'r1', returnAll: false, limit: 130 },
    {
      http: async (o) => {
        const data = Array.from({ length: o.qs.limit }, () => ({ n: n++ }));
        return json({ data, pagination: { limit: o.qs.limit, next_cursor: 'more' + n, total: 999 } });
      },
    },
  );
  assert.equal(out.length, 130);
  assert.deepEqual(calls.map((c) => c.qs.limit), [100, 30]);
});

test('paging stops when the server repeats a cursor', async () => {
  const { calls } = await run(
    { resource: 'alert', operation: 'getMany', account: 'me', returnAll: true },
    { http: async () => json({ data: [{ a: 1 }], pagination: { limit: 100, next_cursor: 'same', total: 5 } }) },
  );
  assert.equal(calls.length, 2);
});

test('arrays split into items; objects become one item; rates untouched', async () => {
  const rate = { pct: 26, low: 15.9, high: 39.6, interval: '15.9 to 39.6', base: '13 of 50 answers' };
  const list = await run({ resource: 'fix', operation: 'getMany', account: 'me' }, { http: async () => json({ sample: true, data: [{ f: 1 }, { f: 2 }] }) });
  assert.deepEqual(list.out.map((i) => i.json), [{ f: 1 }, { f: 2 }]);
  const one = await run({ resource: 'run', operation: 'getSummary', account: 'me', run: 'r' }, {
    http: async () => json({ data: { scheduled: { named: 13, scored: 50, named_rate: rate } } }),
  });
  assert.equal(one.out.length, 1);
  assert.deepEqual(one.out[0].json.scheduled.named_rate, rate);
  assert.equal(one.out[0].json.scheduled.named, 13);
});

test('problem details become NodeApiError with status and detail', async () => {
  await assert.rejects(
    run({ resource: 'run', operation: 'get', account: 'me', run: 'nope' }, {
      http: async () => json({ status: 404, code: 'not_found', detail: 'No run with that id is available to this key.' }, 404),
    }),
    (err) => {
      assert.ok(err instanceof NodeApiError);
      assert.equal(err.httpCode, '404');
      assert.match(err.message, /404 not_found/);
      assert.match(err.description, /No run with that id/);
      return true;
    },
  );
});

test('401 key_revoked and 409 run_not_delivered surface their codes', async () => {
  for (const [status, code] of [[401, 'key_revoked'], [409, 'run_not_delivered']]) {
    await assert.rejects(
      run({ resource: 'run', operation: 'getSummary', account: 'me', run: 'r' }, {
        http: async () => json({ status, code, detail: 'x' }, status),
      }),
      (err) => err instanceof NodeApiError && err.httpCode === String(status) && err.message.includes(code),
    );
  }
});

test('429 is retried once after Retry-After', async () => {
  let n = 0;
  const { out, calls } = await run({ resource: 'account', operation: 'getKey' }, {
    http: async () => (n++ === 0 ? json({ code: 'rate_limited', detail: 'Slow down.' }, 429, { 'retry-after': '0' }) : json({ data: { ok: true } })),
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(out[0].json, { ok: true });
});

test('a second 429 fails with the Retry-After hint', async () => {
  await assert.rejects(
    run({ resource: 'account', operation: 'getKey' }, {
      http: async () => json({ code: 'rate_limited', detail: 'Slow down.' }, 429, { 'retry-after': '0' }),
    }),
    (err) => err instanceof NodeApiError && err.httpCode === '429' && /Retry after 0 seconds/.test(err.description),
  );
});

test('Continue On Fail returns the error as an item', async () => {
  const { out } = await run({ resource: 'run', operation: 'get', account: 'me', run: 'x' }, {
    continueOnFail: true,
    http: async () => json({ code: 'not_found', detail: 'gone' }, 404),
  });
  assert.equal(out.length, 1);
  assert.match(out[0].json.error, /404 not_found/);
});

test('each input item is paired with its output', async () => {
  const { out } = await run({ resource: 'fix', operation: 'getMany', account: 'me' }, {
    items: [{ json: {} }, { json: {} }],
    http: async () => json({ data: [{ f: 1 }] }),
  });
  assert.deepEqual(out.map((i) => i.pairedItem), [{ item: 0 }, { item: 1 }]);
});

test('credential: bearer header, GET /me test, password field', () => {
  const cred = new BroadcastwellApi();
  assert.equal(cred.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.apiKey}}');
  assert.equal(cred.test.request.url, '/me');
  assert.equal(cred.properties.find((p) => p.name === 'apiKey').typeOptions.password, true);
  assert.equal(cred.properties.find((p) => p.name === 'baseUrl').default, BASE);
});

test('package.json meets the community node rules', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.keywords.includes('n8n-community-node-package'));
  assert.equal(pkg.n8n.n8nNodesApiVersion, 1);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(pkg.peerDependencies, { 'n8n-workflow': '*' });
  for (const file of [...pkg.n8n.nodes, ...pkg.n8n.credentials]) {
    assert.ok(readFileSync(new URL('../' + file, import.meta.url)), file);
  }
});
