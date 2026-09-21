// Tests for the Looker Studio connector. Run: node --test test/*.test.mjs
// Responses come from test/fixtures, captured from the live API with the public demo key.
// Kalvenor is fictional sample data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes, DEFAULT_BASE_URL, ENGINES } from '../../packages/api/src/index.mjs';
import { loadConnector, fixture, fixtureTransport, allFields, connectorSource, DEMO_KEY, UserError } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const plain = (v) => JSON.parse(JSON.stringify(v));
const DATASETS = ['history', 'summary', 'displacement', 'sources', 'alerts'];
const ACCOUNT_KEY = 'bwp_' + 'ab'.repeat(32);

function rowsAsObjects(result) {
  const names = result.schema.map((f) => f.name);
  return result.rows.map((r) => Object.fromEntries(names.map((n, i) => [n, r.values[i]])));
}

async function getAll(dataset, extra, options) {
  const c = await loadConnector(Object.assign({ key: DEMO_KEY }, options));
  const result = plain(
    c.g.getData({ configParams: Object.assign({ dataset }, extra), fields: allFields(c.g, dataset) }),
  );
  return { c, result, rows: rowsAsObjects(result) };
}

function catchUserError(fn) {
  try {
    fn();
  } catch (e) {
    if (e instanceof UserError) return e;
    throw e;
  }
  assert.fail('expected a user error');
}

// ---------------------------------------------------------------------------
// Build and manifest
// ---------------------------------------------------------------------------

test('the bundle carries every route from packages/api and no route is spelt in src', async () => {
  const src = await connectorSource();
  for (const name of Object.keys(routes)) assert.ok(src.includes('"' + name + '"'), name);
  for (const file of ['Api.js', 'Code.js', 'Mapping.js', 'Schema.js']) {
    const text = readFileSync(join(ROOT, 'src', file), 'utf8');
    assert.ok(!/['"]\/accounts\//.test(text), file + ' spells a route path');
    assert.ok(!text.includes('app.broadcastwell.com/api'), file + ' spells the base URL');
  }
  const c = await loadConnector();
  assert.equal(c.g.BroadcastwellRoutes.DEFAULT_BASE_URL, DEFAULT_BASE_URL);
  assert.deepEqual(plain(c.g.BroadcastwellRoutes.ENGINES), ENGINES);
});

test('dist/ matches a fresh build', async () => {
  assert.equal(readFileSync(join(ROOT, 'dist', 'Code.js'), 'utf8'), await connectorSource());
  assert.equal(
    readFileSync(join(ROOT, 'dist', 'appsscript.json'), 'utf8'),
    readFileSync(join(ROOT, 'src', 'appsscript.json'), 'utf8'),
  );
});

test('manifest: explicit scopes, allow list and the fields a Partner listing needs', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'src', 'appsscript.json'), 'utf8'));
  assert.deepEqual(m.oauthScopes, ['https://www.googleapis.com/auth/script.external_request']);
  assert.equal(m.runtimeVersion, 'V8');
  assert.ok(m.urlFetchWhitelist.every((u) => u.startsWith('https://') && u.endsWith('/')));
  assert.ok(m.urlFetchWhitelist.some((u) => (DEFAULT_BASE_URL + '/').startsWith(u)));
  const d = m.dataStudio;
  for (const k of ['name', 'company', 'companyUrl', 'logoUrl', 'addonUrl', 'supportUrl', 'description', 'shortDescription', 'privacyPolicyUrl', 'termsOfServiceUrl', 'authType', 'feeType', 'sources']) {
    assert.ok(d[k], 'missing ' + k);
  }
  assert.ok(d.name.length <= 28);
  assert.ok(!/connector/i.test(d.name));
  assert.ok(d.shortDescription.length <= 114);
  assert.ok(!/https?:/.test(d.shortDescription));
  assert.ok(d.logoUrl.startsWith('https://app.broadcastwell.com/'));
  assert.ok(!d.supportUrl.startsWith('mailto:'));
  assert.deepEqual(d.authType, ['KEY']);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

test('getAuthType is KEY with a help link', async () => {
  const { g } = await loadConnector();
  const r = plain(g.getAuthType());
  assert.equal(r.type, 'KEY');
  assert.equal(r.helpUrl, 'https://app.broadcastwell.com/developers');
});

test('setCredentials accepts the demo key after GET /me and stores it', async () => {
  const c = await loadConnector();
  assert.equal(c.g.setCredentials({ key: '  ' + DEMO_KEY + ' ' }).errorCode, 'NONE');
  assert.equal(c.properties.get('dscc.key'), DEMO_KEY);
  assert.deepEqual(c.calls, [DEFAULT_BASE_URL + '/me']);
});

test('setCredentials rejects a malformed key without calling the API', async () => {
  const c = await loadConnector();
  for (const key of ['', 'abc', 'bwp_123', 'Bearer ' + DEMO_KEY, undefined]) {
    assert.equal(c.g.setCredentials({ key }).errorCode, 'INVALID_CREDENTIALS');
  }
  assert.equal(c.calls.length, 0);
  assert.equal(c.properties.size, 0);
});

test('setCredentials rejects a well formed key the API answers 401 for', async () => {
  const c = await loadConnector();
  assert.equal(c.g.setCredentials({ key: ACCOUNT_KEY }).errorCode, 'INVALID_CREDENTIALS');
  assert.equal(c.calls.length, 1);
  assert.equal(c.properties.size, 0);
});

test('isAuthValid and resetAuth', async () => {
  const c = await loadConnector();
  assert.equal(c.g.isAuthValid(), false);
  c.g.setCredentials({ key: DEMO_KEY });
  assert.equal(c.g.isAuthValid(), true);
  c.g.resetAuth();
  assert.equal(c.g.isAuthValid(), false);
  const bad = await loadConnector({ key: ACCOUNT_KEY });
  assert.equal(bad.g.isAuthValid(), false);
});

test('isAuthValid keeps a stored key when the API is busy', async () => {
  const busy = { status: 503, headers: {}, body: { code: 'unavailable', detail: 'Try again.' } };
  const c = await loadConnector({ key: DEMO_KEY, transport: () => busy });
  assert.equal(c.g.isAuthValid(), true);
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

test('getConfig step 1 asks for account and data set and stays stepped', async () => {
  const { g, calls } = await loadConnector({ key: DEMO_KEY });
  const cfg = plain(g.getConfig({}));
  assert.equal(cfg.isSteppedConfig, true);
  const byId = Object.fromEntries(cfg.configParams.map((p) => [p.name, p]));
  assert.ok(byId.account.isDynamic && byId.dataset.isDynamic);
  assert.equal(byId.account.placeholder, 'me');
  assert.match(byId.account.helpText, /sample/);
  assert.deepEqual(byId.dataset.options.map((o) => o.value), DATASETS);
  assert.equal(calls.length, 0);
});

test('getConfig step 2 for history offers the three scopes', async () => {
  const { g } = await loadConnector({ key: DEMO_KEY });
  const cfg = plain(g.getConfig({ configParams: { dataset: 'history' } }));
  assert.equal(cfg.isSteppedConfig, false);
  const scope = cfg.configParams.find((p) => p.name === 'history_scope');
  assert.deepEqual(scope.options.map((o) => o.value), ['account', 'engine', 'question_type']);
});

test('getConfig step 2 for a run level data set lists runs from every page, plus Latest run', async () => {
  const { g, calls } = await loadConnector({ key: DEMO_KEY });
  const cfg = plain(g.getConfig({ configParams: { dataset: 'summary', account: 'me' } }));
  assert.equal(cfg.isSteppedConfig, false);
  const run = cfg.configParams.find((p) => p.name === 'run_id');
  assert.deepEqual(run.options.map((o) => o.value), ['latest', 'kalvenor-monitor', 'baseline-kalvenor-v11', 'baseline-kalvenor-001']);
  assert.match(run.options[1].label, /kalvenor-monitor \(monitor, 3 scheduled passes, 2026-08-12\)/);
  assert.ok(cfg.configParams.some((p) => p.name === 'include_adaptive'));
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes('/accounts/sample/runs?limit=100'), 'demo key reads sample for me');
  assert.ok(calls[1].includes('cursor=YzE6Mg'));
});

test('getConfig for alerts needs no second question', async () => {
  const { g } = await loadConnector({ key: DEMO_KEY });
  const cfg = plain(g.getConfig({ configParams: { dataset: 'alerts' } }));
  assert.equal(cfg.isSteppedConfig, false);
  assert.deepEqual(cfg.configParams.map((p) => p.name), ['intro', 'account', 'dataset']);
});

test('getConfig reports an unknown account as a user error', async () => {
  const { g } = await loadConnector({ key: DEMO_KEY });
  const e = catchUserError(() => g.getConfig({ configParams: { dataset: 'sources', account: 'not-an-account' } }));
  assert.match(e.userText, /No account or run with that id/);
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

test('getSchema per data set: types, counts as summed metrics, rates split in five', async () => {
  const { g } = await loadConnector({ key: DEMO_KEY });
  const expectRates = { history: ['named'], summary: ['named', 'cited'], displacement: [], sources: [], alerts: ['from_named', 'to_named'] };
  const expectDates = { history: ['observed_on'], summary: [], displacement: [], sources: [], alerts: ['observed_on', 'from_observed_on', 'to_observed_on'] };
  for (const ds of DATASETS) {
    const schema = plain(g.getSchema({ configParams: { dataset: ds } })).schema;
    const by = Object.fromEntries(schema.map((f) => [f.name, f]));
    assert.equal(schema.length, new Set(schema.map((f) => f.name)).size, ds + ' duplicate ids');
    for (const p of expectRates[ds]) {
      for (const s of ['pct', 'low', 'high']) {
        assert.equal(by[p + '_' + s].semantics.semanticType, 'NUMBER');
        assert.equal(by[p + '_' + s].defaultAggregationType, 'NO_AGGREGATION', p + '_' + s + ' must not be summed');
      }
      for (const s of ['interval', 'base']) {
        assert.equal(by[p + '_' + s].semantics.semanticType, 'TEXT');
        assert.equal(by[p + '_' + s].semantics.conceptType, 'DIMENSION');
      }
    }
    for (const d of expectDates[ds]) assert.equal(by[d].semantics.semanticType, 'YEAR_MONTH_DAY');
    for (const f of schema) {
      if (f.semantics.conceptType === 'METRIC') assert.equal(f.dataType, 'NUMBER', f.name);
    }
  }
  const history = Object.fromEntries(plain(g.getSchema({ configParams: { dataset: 'history' } })).schema.map((f) => [f.name, f]));
  for (const n of ['named', 'scored', 'observed', 'excluded']) assert.equal(history[n].defaultAggregationType, 'SUM');
  assert.equal(history.engine_label.semantics.conceptType, 'DIMENSION');
});

test('getSchema without a data set is a user error', async () => {
  const { g } = await loadConnector({ key: DEMO_KEY });
  const e = catchUserError(() => g.getSchema({ configParams: {} }));
  assert.match(e.userText, /Choose a data set/);
});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

test('getData honours only the requested fields, in the requested order', async () => {
  const c = await loadConnector({ key: DEMO_KEY });
  const fields = [{ name: 'named_base' }, { name: 'observed_on' }, { name: 'engine_label' }, { name: 'named' }];
  const r = plain(c.g.getData({ configParams: { dataset: 'history', history_scope: 'engine' }, fields }));
  assert.deepEqual(r.schema.map((f) => f.name), ['named_base', 'observed_on', 'engine_label', 'named']);
  assert.ok(r.rows.length > 0);
  for (const row of r.rows) assert.equal(row.values.length, 4);
  assert.deepEqual(r.rows[0].values, ['5 of 30 answers', '20260115', 'ChatGPT', 5]);
  assert.ok(c.calls[0].endsWith('/accounts/sample/history?scope=engine'));
});

test('history rows: rate split, integer counts, movement and method breaks', async () => {
  const { rows } = await getAll('history', { history_scope: 'account' });
  const body = fixture('history-account').body;
  assert.equal(rows.length, body.data[0].points.length);
  const june = rows.find((r) => r.pass_id === '2026-06');
  assert.equal(june.named, 3);
  assert.equal(june.scored, 50);
  assert.equal(june.named_pct, 6);
  assert.equal(june.named_low, 2.1);
  assert.equal(june.named_high, 16.2);
  assert.equal(june.named_interval, '2.1 to 16.2');
  assert.equal(june.named_base, '3 of 50 answers');
  assert.equal(june.observed_on, '20260612');
  assert.equal(june.movement, 'Moved down');
  assert.equal(rows.find((r) => r.pass_id === '2026-05').method_break_before, true);
  assert.equal(june.method_break_before, false);
  assert.equal(june.engine_label, '');
  assert.ok(rows.every((r) => r.pass_kind !== 'adaptive'));
});

test('history engine scope uses the exact engine labels', async () => {
  const { rows } = await getAll('history', { history_scope: 'engine' });
  const labels = [...new Set(rows.map((r) => r.engine_label))];
  assert.deepEqual(labels, ['ChatGPT', 'Claude', 'Perplexity', 'Google AI Overviews', 'Google AI Mode']);
});

test('summary: Latest run resolves to the newest delivered run with scheduled passes', async () => {
  const { c, rows } = await getAll('summary', { run_id: 'latest' });
  assert.ok(c.calls[c.calls.length - 1].endsWith('/accounts/sample/runs/kalvenor-monitor/summary'));
  assert.deepEqual(rows.map((r) => r.segment_type), ['overall', 'engine', 'engine', 'engine', 'engine', 'engine', 'question_type']);
  const overall = rows[0];
  assert.equal(overall.named, 30);
  assert.equal(overall.scored, 150);
  assert.equal(overall.named_pct, 20);
  assert.equal(overall.named_base, '30 of 150 answers');
  assert.equal(overall.own_domain_cited, 6);
  assert.equal(overall.cited_interval, '1.8 to 8.5');
  assert.equal(overall.questions_with_a_mention, 10);
  assert.deepEqual(rows.slice(1, 6).map((r) => r.engine_label), Object.values(ENGINES));
  assert.ok(rows.every((r) => r.pass_group === 'Scheduled'));
});

test('summary: adaptive is never added in, and is its own row only when asked', async () => {
  const withAdaptive = fixture('summary-with-adaptive');
  const overrides = { '/accounts/sample/runs/baseline-kalvenor-v11/summary||': { status: 200, headers: {}, body: withAdaptive.body } };
  const params = { run_id: 'baseline-kalvenor-v11' };
  const off = await getAll('summary', params, { transport: fixtureTransport(overrides) });
  const on = await getAll('summary', Object.assign({ include_adaptive: 'true' }, params), { transport: fixtureTransport(overrides) });
  const scheduled = withAdaptive.body.data.scheduled;
  assert.equal(off.rows[0].named, scheduled.named);
  assert.equal(on.rows[0].named, scheduled.named);
  assert.ok(!off.rows.some((r) => r.segment_type === 'adaptive'));
  const a = on.rows.find((r) => r.segment_type === 'adaptive');
  assert.equal(a.pass_group, 'Adaptive (shown separately)');
  assert.equal(a.named, 8);
  assert.equal(a.named_base, '8 of 24 answers');
  assert.equal(on.rows.length, off.rows.length + 1);
});

test('displacement pages through next_cursor: one row per question and competitor', async () => {
  const { c, rows } = await getAll('displacement', { run_id: 'kalvenor-monitor' });
  assert.equal(c.calls.length, 2);
  assert.ok(c.calls[0].includes('limit=100') && !c.calls[0].includes('cursor='));
  assert.ok(c.calls[1].includes('cursor=YzE6Mw'));
  const items = fixture('displacement-page1').body.data.concat(fixture('displacement-page2').body.data);
  assert.equal(rows.length, items.reduce((n, q) => n + q.competitors.length, 0));
  const r = rows.find((x) => x.question_id === 1 && x.competitor === 'Northvale FSM');
  assert.equal(r.competitor_named_instead, 8);
  assert.equal(r.client_absent, 11);
  assert.equal(rows.find((x) => x.question_id === 1 && x.competitor === 'Asterforge').competitor_status, 'Checked, not found');
});

test('sources pages through next_cursor and keeps the URL, booleans and engine labels', async () => {
  const { c, rows } = await getAll('sources', { run_id: 'kalvenor-monitor' });
  assert.equal(c.calls.length, 2);
  assert.equal(rows.length, fixture('sources-page1').body.data.length + fixture('sources-page2').body.data.length);
  const first = rows[0];
  assert.equal(first.url, 'https://veranofsm.example/core/7');
  assert.equal(first.own_domain, false);
  assert.equal(first.times_cited, 7);
  assert.equal(first.engine_count, 5);
  assert.equal(first.engine_labels, 'ChatGPT, Claude, Perplexity, Google AI Overviews, Google AI Mode');
  assert.equal(first.receipt_count, 7);
});

test('alerts: both sides split into counts and rates', async () => {
  const { rows } = await getAll('alerts', {});
  assert.equal(rows.length, fixture('alerts').body.data.length);
  const a = rows.find((r) => r.scope === 'account');
  assert.equal(a.direction, 'down');
  assert.equal(a.from_named, 20);
  assert.equal(a.to_named, 3);
  assert.equal(a.to_named_interval, '2.1 to 16.2');
  assert.equal(a.to_named_base, '3 of 50 answers');
  assert.equal(a.observed_on, '20260612');
  assert.equal(a.from_observed_on, '20260512');
  assert.match(a.receipts_api_url, /^https:\/\/app\.broadcastwell\.com\/api\/v1\//);
});

test('every count column holds whole numbers and every rate column a number or nothing', async () => {
  const params = { history: { history_scope: 'question_type' }, summary: {}, displacement: {}, sources: {}, alerts: {} };
  for (const ds of DATASETS) {
    const { c, rows } = await getAll(ds, params[ds]);
    const defs = c.g.BwSchema.dataset(ds).fields;
    assert.ok(rows.length > 0, ds);
    for (const f of defs) {
      for (const row of rows) {
        const v = row[f[0]];
        if (f[3] === 'count' && v !== null) assert.ok(Number.isInteger(v), ds + '.' + f[0] + ' = ' + v);
        if (f[3] === 'rate' && v !== null) assert.equal(typeof v, 'number', ds + '.' + f[0]);
        if (f[2] === 'YEAR_MONTH_DAY' && v !== null) assert.match(v, /^\d{8}$/);
      }
    }
  }
});

test('answers are cached: a second getData makes no new request', async () => {
  const c = await loadConnector({ key: DEMO_KEY });
  const req = { configParams: { dataset: 'alerts' }, fields: [{ name: 'alert_id' }] };
  c.g.getData(req);
  const n = c.calls.length;
  c.g.getData(req);
  assert.equal(c.calls.length, n);
  assert.ok([...c.cache.keys()].every((k) => /^bw1:[0-9a-f]{64}$/.test(k)), 'cache keys hide the API key');
});

test('an account key reads account me', async () => {
  const seen = [];
  const transport = (url) => {
    seen.push(url);
    return { status: 200, headers: {}, body: { data: [], pagination: { next_cursor: null } } };
  };
  const c = await loadConnector({ key: ACCOUNT_KEY, transport });
  c.g.getData({ configParams: { dataset: 'alerts', account: '' }, fields: [{ name: 'alert_id' }] });
  assert.ok(seen[0].startsWith(DEFAULT_BASE_URL + '/accounts/me/alerts'));
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

async function errorFor(status, headers, body, params) {
  const transport = () => ({ status, headers: headers || {}, body });
  const c = await loadConnector({ key: DEMO_KEY, transport, cache: false });
  const e = catchUserError(() => c.g.getData({ configParams: params || { dataset: 'history' }, fields: [{ name: 'named' }] }));
  return { e, c };
}

test('401 tells the user to add a valid key and names the demo key', async () => {
  const { e } = await errorFor(401, {}, fixture('error-401').body);
  assert.match(e.userText, /did not accept the API key/);
  assert.ok(e.userText.includes(DEMO_KEY));
  assert.match(e.debugText, /401 unauthorized/);
});

test('404 for a missing run', async () => {
  const c = await loadConnector({ key: DEMO_KEY });
  const e = catchUserError(() => c.g.getData({ configParams: { dataset: 'summary', run_id: 'no-such-run' }, fields: [{ name: 'named' }] }));
  assert.match(e.userText, /No account or run with that id/);
  assert.match(e.userText, /No run with that id is available to this key/);
});

test('409 explains the run is not ready', async () => {
  const { e } = await errorFor(409, {}, { code: 'conflict', detail: 'The run is still being measured.' });
  assert.match(e.userText, /cannot return this data yet/);
});

test('429 with a long Retry-After is reported with the wait, not retried', async () => {
  const { e, c } = await errorFor(429, { 'Retry-After': '30' }, { code: 'rate_limited', detail: 'Slow down.' });
  assert.match(e.userText, /Wait 30 seconds/);
  assert.equal(c.calls.length, 1);
  assert.deepEqual(c.sleeps, []);
});

test('429 with a short Retry-After is retried once after sleeping', async () => {
  let n = 0;
  const ok = fixture('history-account');
  const transport = () => (++n === 1 ? { status: 429, headers: { 'retry-after': '2' }, body: { code: 'rate_limited' } } : { status: 200, headers: {}, body: ok.body });
  const c = await loadConnector({ key: DEMO_KEY, transport });
  const r = plain(c.g.getData({ configParams: { dataset: 'history' }, fields: [{ name: 'named' }] }));
  assert.equal(r.rows.length, ok.body.data[0].points.length);
  assert.deepEqual(plain(c.sleeps), [2000]);
  assert.equal(c.calls.length, 2);
});

test('400, 500 and network failures become readable messages', async () => {
  const bad = await errorFor(400, {}, fixture('error-400').body);
  assert.match(bad.e.userText, /limit must be a whole number/);
  const down = await errorFor(502, {}, { code: 'bad_gateway' });
  assert.match(down.e.userText, /did not answer this time/);
  const c = await loadConnector({ key: DEMO_KEY, cache: false, transport: () => { throw new Error('DNS error'); } });
  const net = catchUserError(() => c.g.getData({ configParams: { dataset: 'alerts' }, fields: [{ name: 'alert_id' }] }));
  assert.match(net.userText, /could not reach the Broadcastwell API/);
});

test('getData without a stored key asks for one', async () => {
  const c = await loadConnector();
  const e = catchUserError(() => c.g.getData({ configParams: { dataset: 'alerts' }, fields: [{ name: 'alert_id' }] }));
  assert.match(e.userText, /Add your Broadcastwell API key/);
});

test('Latest run with no delivered scheduled run is a clear message', async () => {
  const transport = () => ({ status: 200, headers: {}, body: { data: [], pagination: { next_cursor: null } } });
  const c = await loadConnector({ key: DEMO_KEY, transport });
  const e = catchUserError(() => c.g.getData({ configParams: { dataset: 'sources' }, fields: [{ name: 'url' }] }));
  assert.match(e.userText, /no delivered run with scheduled passes/);
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('latestRunId, ymd and toValues', async () => {
  const { g } = await loadConnector();
  assert.equal(g.BwMap.latestRunId(fixture('runs-all').body.data), 'kalvenor-monitor');
  assert.equal(g.BwMap.ymd('2026-07-12T08:03:00.000Z'), '20260712');
  assert.equal(g.BwMap.ymd('not a date'), null);
  const values = plain(g.BwMap.toValues([{ a: 1 }], ['a', 'b', 'c', 'd'], { a: 'NUMBER', b: 'NUMBER', c: 'TEXT', d: 'BOOLEAN' }));
  assert.deepEqual(values, [{ values: [1, null, '', false] }]);
});
