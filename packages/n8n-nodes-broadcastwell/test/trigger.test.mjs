import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { BroadcastwellTrigger, BroadcastwellWebhookApi, signature, webhookContext } from './helpers.mjs';

const SECRET = 'whsec_trigger_test_secret';
const ALL = ['run.completed', 'alert.fired', 'fix.updated', 'proof.updated', 'webhook.test'];
const trigger = new BroadcastwellTrigger();

function envelope(type = 'run.completed') {
  return JSON.stringify({
    id: 'evt_123',
    type,
    api_version: '1',
    created_at: '2026-09-21T12:00:00Z',
    account_id: 'sample',
    data: { run_id: 'baseline-kalvenor-v11', named: 13, named_rate: { pct: 26, low: 15.9, high: 39.6, interval: '15.9 to 39.6', base: '13 of 50 answers' } },
  });
}

function sign(raw, t = Math.floor(Date.now() / 1000), secret = SECRET) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
}

function headersFor(raw, sig, type = 'run.completed') {
  return {
    'Broadcastwell-Signature': sig ?? sign(raw),
    'Broadcastwell-Event': type,
    'Broadcastwell-Event-Id': 'evt_123',
    'Broadcastwell-Delivery': 'dlv_456',
    'Content-Type': 'application/json',
  };
}

async function deliver({ raw = envelope(), sig, events = ALL, rawMode, parsedBody, secret = SECRET, type } = {}) {
  const ctx = webhookContext({ secret, headers: headersFor(raw, sig, type), rawBody: raw, parsedBody, events, rawMode });
  const result = await trigger.webhook.call(ctx);
  return { result, response: ctx.response };
}

test('a valid signature starts the workflow with the envelope and headers', async () => {
  const { result, response } = await deliver();
  assert.equal(response.statusCode, 200);
  const [[item]] = result.workflowData;
  assert.equal(item.json.id, 'evt_123');
  assert.equal(item.json.type, 'run.completed');
  assert.equal(item.json.api_version, '1');
  assert.equal(item.json.account_id, 'sample');
  assert.deepEqual(item.json.data.named_rate, { pct: 26, low: 15.9, high: 39.6, interval: '15.9 to 39.6', base: '13 of 50 answers' });
  assert.equal(item.json.headers.event, 'run.completed');
  assert.equal(item.json.headers.event_id, 'evt_123');
  assert.equal(item.json.headers.delivery, 'dlv_456');
  assert.equal(typeof item.json.headers.signature_timestamp, 'number');
});

test('wrong secret is rejected with 401 and no workflow run', async () => {
  const raw = envelope();
  const { result, response } = await deliver({ raw, sig: sign(raw, undefined, 'not_the_secret') });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.sent, { error: 'invalid_signature', reason: 'signature_mismatch' });
  assert.deepEqual(result, { noWebhookResponse: true });
});

test('tampered body is rejected with 401', async () => {
  const raw = envelope();
  const sig = sign(raw);
  const tampered = raw.replace('"named":13', '"named":31');
  const { response } = await deliver({ raw: tampered, sig });
  assert.equal(response.statusCode, 401);
  assert.equal(response.sent.reason, 'signature_mismatch');
});

test('a timestamp more than 300 seconds old or ahead is rejected', async () => {
  const raw = envelope();
  const now = Math.floor(Date.now() / 1000);
  for (const t of [now - 301, now + 400]) {
    const { response } = await deliver({ raw, sig: sign(raw, t) });
    assert.equal(response.statusCode, 401);
    assert.equal(response.sent.reason, 'stale_timestamp');
  }
  const { response } = await deliver({ raw, sig: sign(raw, now - 250) });
  assert.equal(response.statusCode, 200);
});

test('missing and malformed signature headers are rejected', async () => {
  const raw = envelope();
  const missing = await deliver({ raw, sig: '' });
  assert.equal(missing.response.statusCode, 401);
  assert.equal(missing.response.sent.reason, 'missing_header');
  const malformed = await deliver({ raw, sig: 't=now,v1=abc' });
  assert.equal(malformed.response.sent.reason, 'malformed_header');
});

test('events not selected are acknowledged and ignored', async () => {
  const raw = envelope('fix.updated');
  const { result, response } = await deliver({ raw, events: ['run.completed'], type: 'fix.updated' });
  assert.equal(response.statusCode, 200);
  assert.equal(result.workflowData, undefined);
  assert.deepEqual(result.webhookResponse, { received: true, ignored: true, type: 'fix.updated' });
});

test('webhook.test starts the workflow when selected', async () => {
  const raw = envelope('webhook.test');
  const { result } = await deliver({ raw, events: ['webhook.test'], type: 'webhook.test' });
  assert.equal(result.workflowData[0][0].json.type, 'webhook.test');
});

test('raw body is read with readRawBody when rawBody is not set yet', async () => {
  const { result } = await deliver({ rawMode: 'readRawBody' });
  assert.ok(result.workflowData);
});

test('without any raw body the re-serialised body is used, and pretty JSON fails safely', async () => {
  const compact = envelope();
  const ok = await deliver({ raw: compact, rawMode: 'none' });
  assert.ok(ok.result.workflowData);
  const pretty = JSON.stringify(JSON.parse(compact), null, 2);
  const bad = await deliver({ raw: pretty, rawMode: 'none', parsedBody: JSON.parse(pretty) });
  assert.equal(bad.response.statusCode, 401);
});

test('signature helper matches an independent HMAC and supports several v1 values', () => {
  const raw = envelope();
  const t = 1790000000;
  const good = sign(raw, t).split('v1=')[1];
  assert.equal(signature.computeSignature(SECRET, t, raw), good);
  const header = `t=${t},v1=${'0'.repeat(64)},v1=${good}`;
  assert.deepEqual(signature.verifySignature(SECRET, header, Buffer.from(raw), t), { valid: true, timestamp: t });
  assert.equal(signature.verifySignature('', header, raw, t).reason, 'missing_secret');
});

test('webhook lifecycle methods are no-ops because destinations are added in the account', async () => {
  const { checkExists, create, delete: remove } = trigger.webhookMethods.default;
  assert.equal(await checkExists.call({}), true);
  assert.equal(await create.call({}), true);
  assert.equal(await remove.call({}), true);
});

test('trigger description: POST webhook, no inputs, secret credential tested by the node', async () => {
  const d = trigger.description;
  assert.deepEqual(d.inputs, []);
  assert.equal(d.webhooks[0].httpMethod, 'POST');
  assert.equal(d.credentials[0].name, 'broadcastwellWebhookApi');
  const testFn = trigger.methods.credentialTest[d.credentials[0].testedBy];
  assert.equal((await testFn.call({}, { data: { signingSecret: 'abc' } })).status, 'OK');
  assert.equal((await testFn.call({}, { data: { signingSecret: '' } })).status, 'Error');
  const cred = new BroadcastwellWebhookApi();
  assert.equal(cred.properties[0].typeOptions.password, true);
});
