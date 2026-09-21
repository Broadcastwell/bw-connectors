#!/usr/bin/env node
// Runs every Broadcastwell node operation against the live API with the public demo
// key, outside n8n, through a stand-in for IExecuteFunctions (test/helpers.mjs) whose
// HTTP helper is a real fetch. Also delivers a locally signed event to the trigger.
// Calls are spaced 2.5 s apart to stay under the demo limit of 30 requests a minute.
//
//   npm run build && node scripts/live-demo.mjs [transcript.md]
//
// The demo key reads only the fictional Kalvenor sample account.

import { writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import {
  Broadcastwell,
  BroadcastwellTrigger,
  executeContext,
  fetchHttp,
  generated,
  webhookContext,
} from '../test/helpers.mjs';

const out = process.argv[2];
const node = new Broadcastwell();
const credentials = { apiKey: generated.DEMO_KEY, baseUrl: generated.DEFAULT_BASE_URL };
const pause = () => new Promise((r) => setTimeout(r, 2500));
const log = [];
const done = new Set();
let first = true;

function trim(value) {
  const lines = JSON.stringify(value, null, 2).split('\n');
  return lines.length > 36 ? [...lines.slice(0, 36), `... (${lines.length - 36} more lines trimmed)`].join('\n') : lines.join('\n');
}

async function op(params) {
  if (!first) await pause();
  first = false;
  const ctx = executeContext({ params: { account: 'me', ...params }, credentials, http: fetchHttp });
  const label = `${params.resource}: ${params.operation}`;
  const started = Date.now();
  try {
    const [items] = await node.execute.call(ctx);
    done.add(`${params.resource}:${params.operation}`);
    const requests = ctx.calls.map((c) => {
      const u = new URL(c.url);
      for (const [k, v] of Object.entries(c.qs || {})) u.searchParams.set(k, String(v));
      return `GET ${u}`;
    });
    log.push(`### ${label}\n\nParameters: \`${JSON.stringify({ account: 'me', ...params })}\`  \nRequests: ${requests.map((r) => '`' + r + '`').join(', ')}  \nOutput: ${items.length} item(s), ${Date.now() - started} ms. First item:\n\n\`\`\`json\n${trim(items[0] ? items[0].json : null)}\n\`\`\`\n`);
    return items;
  } catch (err) {
    log.push(`### ${label}\n\nParameters: \`${JSON.stringify({ account: 'me', ...params })}\`  \nError (${err.constructor.name}): ${err.message}${err.description ? '. ' + err.description : ''}${err.httpCode ? ' [HTTP ' + err.httpCode + ']' : ''}\n`);
    return [];
  }
}

const RUN = 'baseline-kalvenor-v11';
await op({ resource: 'account', operation: 'getKey' });
await op({ resource: 'method', operation: 'get' });
await op({ resource: 'account', operation: 'get' });
await op({ resource: 'run', operation: 'getMany', returnAll: true });
await op({ resource: 'run', operation: 'get', run: RUN });
await op({ resource: 'run', operation: 'getSummary', run: RUN });
await op({ resource: 'run', operation: 'compare', run: RUN, other: 'kalvenor-monitor' });
await op({ resource: 'question', operation: 'getMany', run: RUN, returnAll: false, limit: 3 });
await op({ resource: 'question', operation: 'get', run: RUN, question: 7 });
const receipts = await op({
  resource: 'receipt',
  operation: 'getMany',
  run: RUN,
  returnAll: false,
  limit: 2,
  filters: { engine: 'google_ai_mode', verdict: 'not_named', pass_id: 'run-1' },
});
const receiptId = receipts[0] ? receipts[0].json.receipt_id : 'unknown';
await op({ resource: 'receipt', operation: 'get', run: RUN, receipt: receiptId });
await op({ resource: 'displacement', operation: 'getMany', run: RUN, returnAll: false, limit: 2 });
await op({ resource: 'source', operation: 'getMany', run: RUN, returnAll: false, limit: 120 });
await op({ resource: 'fix', operation: 'getManyForRun', run: RUN });
await op({ resource: 'fix', operation: 'getMany' });
await op({ resource: 'history', operation: 'get', scope: 'question_type' });
await op({ resource: 'alert', operation: 'getMany', returnAll: true });
await op({ resource: 'proof', operation: 'getMany' });
await op({ resource: 'proof', operation: 'get', experiment: 'sample-proof-01' });
// Expected failure: the demo key cannot read other accounts.
await op({ resource: 'run', operation: 'getMany', account: 'someone-else', returnAll: false, limit: 1 });

// Trigger: a locally signed delivery, no network.
const trigger = new BroadcastwellTrigger();
const secret = 'local_demo_signing_secret';
const raw = JSON.stringify({ id: 'evt_local_1', type: 'webhook.test', api_version: '1', created_at: new Date().toISOString(), account_id: 'sample', data: { message: 'Test event' } });
const t = Math.floor(Date.now() / 1000);
const sig = `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
const headers = { 'Broadcastwell-Signature': sig, 'Broadcastwell-Event': 'webhook.test', 'Broadcastwell-Event-Id': 'evt_local_1', 'Broadcastwell-Delivery': 'dlv_local_1' };
const good = webhookContext({ secret, headers, rawBody: raw, events: ['webhook.test'] });
const goodResult = await trigger.webhook.call(good);
const bad = webhookContext({ secret: 'wrong_secret', headers, rawBody: raw, events: ['webhook.test'] });
await trigger.webhook.call(bad);
log.push(`### Trigger: signed webhook.test delivery (local, no network)\n\nValid signature: workflow started with\n\n\`\`\`json\n${trim(goodResult.workflowData[0][0].json)}\n\`\`\`\n\nWrong secret: HTTP ${bad.response.statusCode} ${JSON.stringify(bad.response.sent)}\n`);

const all = Object.keys((await import('../test/helpers.mjs')).nodeModule.OPERATION_ROUTES);
const missing = all.filter((k) => !done.has(k));
const header = `# n8n-nodes-broadcastwell live transcript\n\nRun on ${new Date().toISOString()} against ${generated.DEFAULT_BASE_URL} with the public demo key bwp_demo_kalvenor_sample. Kalvenor is fictional sample data.\n\nHow: the compiled node's execute() was called with a stand-in for n8n's IExecuteFunctions whose httpRequestWithAuthentication is a real fetch that adds the credential's Bearer header, the same way n8n applies the credential. This was not inside a running n8n instance. Account was set to me throughout; the node read it as sample because the key is the demo key. Calls spaced 2.5 s apart. Output trimmed to about 40 lines.\n\nOperations succeeded: ${done.size} of ${all.length}${missing.length ? ` (failed or not run: ${missing.join(', ')})` : ' (all)'}.\n\n`;
const text = header + log.join('\n');
if (out) writeFileSync(out, text);
console.log(`operations ok ${done.size}/${all.length}; missing: ${missing.join(', ') || 'none'}; trigger valid=${Boolean(goodResult.workflowData)} wrongSecret=${bad.response.statusCode}`);
