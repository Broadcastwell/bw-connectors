import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as esm from '../src/index.mjs';

const require = createRequire(import.meta.url);

test('the CommonJS build exports the same surface as the ES module', () => {
  const cjs = require('../dist/index.cjs');
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
  assert.deepEqual(cjs.routes, esm.routes);
  assert.equal(cjs.DEMO_KEY, 'bwp_demo_kalvenor_sample');
});

test('the CommonJS build works end to end with a fake fetch', async () => {
  const { createClient } = require('../dist/index.cjs');
  const seen = [];
  const client = createClient({
    apiKey: 'bwp_demo_kalvenor_sample',
    fetch: async (url) => {
      seen.push(url);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  await client.listProof();
  assert.equal(seen[0], 'https://app.broadcastwell.com/api/v1/accounts/sample/proof');
});

test('the script build defines a Broadcastwell global without module syntax', async () => {
  const code = readFileSync(new URL('../dist/broadcastwell.global.js', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /\bimport\(/);
  const context = { TextEncoder, crypto: globalThis.crypto, Uint8Array, ArrayBuffer };
  vm.createContext(context);
  vm.runInContext(code + '\nthis.Out = Broadcastwell;', context);
  assert.equal(context.Out.ENGINES.google_ai_mode, 'Google AI Mode');
  const header = await context.Out.signWebhookPayload('s', '{}', 1);
  assert.match(header, /^t=1,v1=[0-9a-f]{64}$/);
});
