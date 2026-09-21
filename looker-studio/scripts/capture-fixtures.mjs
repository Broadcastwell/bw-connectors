#!/usr/bin/env node
// Captures response fixtures from the live API with the public demo key.
// The demo key reads only the Kalvenor sample account. Kalvenor is fictional sample data.
// Calls are spaced 2.6 seconds apart to stay inside the demo limit of 30 a minute.
// Usage: node scripts/capture-fixtures.mjs
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://app.broadcastwell.com/api/v1';
const KEY = 'bwp_demo_kalvenor_sample';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
const NOTE = 'Captured from the live Broadcastwell API with the public demo key. Kalvenor is fictional sample data.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(name, path, key = KEY) {
  const res = await fetch(BASE + path, { headers: { authorization: 'Bearer ' + key, accept: 'application/json' } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  const headers = {};
  for (const h of ['content-type', 'retry-after', 'ratelimit-limit', 'ratelimit-remaining']) {
    const v = res.headers.get(h);
    if (v !== null) headers[h] = v;
  }
  const fixture = { _note: NOTE, captured_on: new Date().toISOString().slice(0, 10), request: 'GET ' + path, status: res.status, headers, body };
  await writeFile(join(OUT, name + '.json'), JSON.stringify(fixture, null, 2) + '\n');
  console.log(res.status, path);
  await sleep(2600);
  return body;
}

const me = await get('me', '/me');
const runs1 = await get('runs-page1', '/accounts/sample/runs?limit=2');
if (runs1.pagination && runs1.pagination.next_cursor) {
  await get('runs-page2', '/accounts/sample/runs?limit=2&cursor=' + encodeURIComponent(runs1.pagination.next_cursor));
}
const runsAll = await get('runs-all', '/accounts/sample/runs?limit=100');
const scheduled = (runsAll.data || []).find((r) => r.kind !== 'adaptive') || (runsAll.data || [])[0];
const run = scheduled.run_id;
await get('history-account', '/accounts/sample/history?scope=account');
await get('history-engine', '/accounts/sample/history?scope=engine');
await get('history-question-type', '/accounts/sample/history?scope=question_type');
await get('summary', `/accounts/sample/runs/${run}/summary`);
const disp = await get('displacement-page1', `/accounts/sample/runs/${run}/displacement?limit=3`);
await get('displacement-page2', `/accounts/sample/runs/${run}/displacement?limit=3&cursor=` + encodeURIComponent(disp.pagination.next_cursor));
const src = await get('sources-page1', `/accounts/sample/runs/${run}/sources?limit=5`);
await get('sources-page2', `/accounts/sample/runs/${run}/sources?limit=5&cursor=` + encodeURIComponent(src.pagination.next_cursor));
await get('summary-with-adaptive', '/accounts/sample/runs/baseline-kalvenor-v11/summary');
await get('alerts', '/accounts/sample/alerts?limit=100');
await get('error-400', '/accounts/sample/runs?limit=500');
await get('error-401', '/me', 'bwp_' + '0'.repeat(64));
await get('error-404-account', '/accounts/not-an-account/runs');
await get('error-404-run', '/accounts/sample/runs/no-such-run/summary');
console.log('run used:', run, 'me:', JSON.stringify(me).slice(0, 200));
