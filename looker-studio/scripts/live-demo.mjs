#!/usr/bin/env node
// Runs the connector against the live API with the public demo key, the way Looker Studio
// would call it, and writes a Markdown transcript with the first rows of every data set.
// The demo key reads only the Kalvenor sample. Kalvenor is fictional sample data.
// Calls are spaced at least 2.6 seconds apart (the demo key allows 30 requests a minute).
//
//   node scripts/live-demo.mjs [transcript.md]

import { writeFileSync } from 'node:fs';
import { loadConnector, liveTransport, allFields, DEMO_KEY, UserError } from '../test/harness.mjs';

const out = process.argv[2];
const plain = (v) => JSON.parse(JSON.stringify(v));
const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

const c = await loadConnector({ transport: liveTransport({ spacingMs: 2600 }) });
const g = c.g;
const started = new Date();

function table(result, columns, max) {
  const names = result.schema.map((f) => f.name);
  const cols = columns.filter((n) => names.includes(n));
  const cell = (v) => (v === null ? '' : String(v).replace(/\|/g, '/').slice(0, 60));
  log('| ' + cols.join(' | ') + ' |');
  log('|' + cols.map(() => ' --- ').join('|') + '|');
  for (const row of result.rows.slice(0, max)) {
    log('| ' + cols.map((n) => cell(row.values[names.indexOf(n)])).join(' | ') + ' |');
  }
}

function run(title, dataset, extra, columns, max) {
  const before = c.calls.length;
  const t0 = Date.now();
  const result = plain(g.getData({ configParams: Object.assign({ dataset }, extra), fields: allFields(g, dataset) }));
  log('');
  log('### ' + title);
  log('');
  log('configParams `' + JSON.stringify(Object.assign({ dataset }, extra)) + '`: ' + result.rows.length + ' rows, ' + result.schema.length + ' fields, ' + (c.calls.length - before) + ' API requests (' + (Date.now() - t0) + ' ms, spacing included).');
  for (const url of c.calls.slice(before)) log('- GET `' + url.replace('https://app.broadcastwell.com/api/v1', '') + '`');
  log('');
  table(result, columns, max || 3);
  return result;
}

log('# Looker Studio connector: live demo transcript');
log('');
log('Run on ' + started.toISOString().slice(0, 10) + ' against https://app.broadcastwell.com/api/v1 with the public demo key `' + DEMO_KEY + '`, through `looker-studio/scripts/live-demo.mjs`. The connector code is the built `dist/Code.js`, run in a Node vm with stand ins for the Apps Script services and a synchronous live transport. Kalvenor is fictional sample data. Rows are trimmed to the first few and to selected columns; every data set was requested with all of its fields.');
log('');
log('## Auth');
log('');
log('- `setCredentials({ key: "' + DEMO_KEY + '" })` returned `' + g.setCredentials({ key: DEMO_KEY }).errorCode + '` after GET `/me`.');
log('- `isAuthValid()` returned `' + g.isAuthValid() + '` (answered from the five minute cache).');
log('- `setCredentials` with a malformed key returned `' + g.setCredentials({ key: 'bwp_short' }).errorCode + '` without a request.');

log('');
log('## Config');
log('');
const step1 = plain(g.getConfig({}));
log('- Step 1: `isSteppedConfig ' + step1.isSteppedConfig + '`, fields ' + step1.configParams.map((p) => '`' + p.name + '`').join(', ') + '.');
const step2 = plain(g.getConfig({ configParams: { account: '', dataset: 'summary' } }));
const runParam = step2.configParams.find((p) => p.name === 'run_id');
log('- Step 2 for Run summary: `isSteppedConfig ' + step2.isSteppedConfig + '`, run options:');
for (const o of runParam.options) log('  - `' + o.value + '`: ' + o.label);

log('');
log('## getData');
const rateCols = ['named', 'scored', 'named_pct', 'named_interval', 'named_base'];
run('History, account scope', 'history', { history_scope: 'account' }, ['observed_on', 'run_id', 'pass_id', 'series', 'movement'].concat(rateCols), 6);
run('History, engine scope', 'history', { history_scope: 'engine' }, ['engine_label', 'observed_on', 'pass_id'].concat(rateCols), 3);
run('History, question type scope', 'history', { history_scope: 'question_type' }, ['segment_label', 'observed_on', 'pass_id'].concat(rateCols), 3);
run('Run summary, Latest run', 'summary', { run_id: 'latest' }, ['run_id', 'segment_type', 'segment_label'].concat(rateCols, ['own_domain_cited', 'cited_base']), 7);
run('Run summary with the adaptive row', 'summary', { run_id: 'baseline-kalvenor-v11', include_adaptive: true }, ['pass_group', 'segment_type', 'segment_label'].concat(rateCols), 11);
run('Named instead, Latest run', 'displacement', { run_id: 'latest' }, ['question_id', 'competitor', 'competitor_status', 'competitor_named', 'competitor_named_instead', 'client_absent'], 4);
run('Sources, Latest run', 'sources', { run_id: 'latest' }, ['domain', 'own_domain', 'times_cited', 'engine_count', 'answers_naming_client'], 4);
run('Alerts', 'alerts', {}, ['observed_on', 'scope', 'segment_label', 'direction', 'from_named_base', 'to_named_base', 'to_named_interval'], 3);

log('');
log('## Errors');
log('');
for (const [label, params] of [
  ['Unknown run', { dataset: 'summary', run_id: 'no-such-run' }],
  ['Unknown account', { dataset: 'alerts', account: 'not-an-account' }],
]) {
  try {
    g.getData({ configParams: params, fields: [{ name: 'named' }] });
    log('- ' + label + ': no error (unexpected)');
  } catch (e) {
    log('- ' + label + ' `' + JSON.stringify(params) + '`: ' + (e instanceof UserError ? 'user error: "' + e.userText + '"' : 'unexpected: ' + e.message));
  }
}

log('');
log('Total API requests: ' + c.calls.length + ' in ' + Math.round((Date.now() - started.getTime()) / 1000) + ' seconds.');

if (out) {
  writeFileSync(out, lines.join('\n') + '\n');
  console.error('wrote ' + out);
}
