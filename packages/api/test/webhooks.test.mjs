import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  verifyWebhookSignature,
  signWebhookPayload,
  parseSignatureHeader,
  EVENT_TYPES,
} from '../src/index.mjs';

const SECRET = 'whsec_test_secret_value';
const NOW = 1790000000;
const body = JSON.stringify({
  id: 'evt_1',
  type: 'run.completed',
  api_version: '1',
  created_at: '2026-09-21T12:00:00Z',
  account_id: 'sample',
  data: { run_id: 'baseline-kalvenor-v11' },
});

function referenceHeader(secret, t, raw) {
  const hex = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return `t=${t},v1=${hex}`;
}

test('a correct signature verifies (matches an independent HMAC)', async () => {
  const header = referenceHeader(SECRET, NOW, body);
  assert.equal(await signWebhookPayload(SECRET, body, NOW), header);
  assert.deepEqual(await verifyWebhookSignature(SECRET, header, body, { now: NOW }), {
    valid: true,
    timestamp: NOW,
  });
});

test('raw body may be bytes', async () => {
  const header = referenceHeader(SECRET, NOW, body);
  const bytes = new TextEncoder().encode(body);
  assert.equal((await verifyWebhookSignature(SECRET, header, bytes, { now: NOW })).valid, true);
  assert.equal((await verifyWebhookSignature(SECRET, header, bytes.buffer, { now: NOW })).valid, true);
  assert.equal((await verifyWebhookSignature(SECRET, header, Buffer.from(body), { now: NOW })).valid, true);
});

test('wrong secret is rejected', async () => {
  const header = referenceHeader('another_secret', NOW, body);
  assert.deepEqual(await verifyWebhookSignature(SECRET, header, body, { now: NOW }), {
    valid: false,
    reason: 'signature_mismatch',
    timestamp: NOW,
  });
});

test('tampered body is rejected', async () => {
  const header = referenceHeader(SECRET, NOW, body);
  const tampered = body.replace('baseline-kalvenor-v11', 'baseline-kalvenor-v12');
  const res = await verifyWebhookSignature(SECRET, header, tampered, { now: NOW });
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'signature_mismatch');
});

test('re-serialised JSON is not the raw body and is rejected', async () => {
  const header = referenceHeader(SECRET, NOW, body);
  const pretty = JSON.stringify(JSON.parse(body), null, 2);
  assert.equal((await verifyWebhookSignature(SECRET, header, pretty, { now: NOW })).valid, false);
});

test('stale and future timestamps are rejected beyond 300 seconds', async () => {
  const old = referenceHeader(SECRET, NOW - 301, body);
  assert.equal((await verifyWebhookSignature(SECRET, old, body, { now: NOW })).reason, 'stale_timestamp');
  const future = referenceHeader(SECRET, NOW + 301, body);
  assert.equal((await verifyWebhookSignature(SECRET, future, body, { now: NOW })).reason, 'stale_timestamp');
  const edge = referenceHeader(SECRET, NOW - 300, body);
  assert.equal((await verifyWebhookSignature(SECRET, edge, body, { now: NOW })).valid, true);
  const custom = referenceHeader(SECRET, NOW - 100, body);
  assert.equal(
    (await verifyWebhookSignature(SECRET, custom, body, { now: NOW, toleranceSeconds: 60 })).reason,
    'stale_timestamp',
  );
});

test('the timestamp is part of the signed payload', async () => {
  const header = referenceHeader(SECRET, NOW, body);
  const moved = header.replace(`t=${NOW}`, `t=${NOW + 1}`);
  assert.equal((await verifyWebhookSignature(SECRET, moved, body, { now: NOW })).reason, 'signature_mismatch');
});

test('missing or malformed headers and secrets are rejected', async () => {
  assert.equal((await verifyWebhookSignature(SECRET, undefined, body)).reason, 'missing_header');
  assert.equal((await verifyWebhookSignature(SECRET, 'garbage', body)).reason, 'malformed_header');
  assert.equal((await verifyWebhookSignature(SECRET, 't=abc,v1=00', body)).reason, 'malformed_header');
  assert.equal((await verifyWebhookSignature('', 't=1,v1=' + '0'.repeat(64), body)).reason, 'missing_secret');
});

test('any of several v1 values may match (secret rotation)', async () => {
  const good = referenceHeader(SECRET, NOW, body).split('v1=')[1];
  const header = `t=${NOW},v1=${'0'.repeat(64)},v1=${good}`;
  assert.equal((await verifyWebhookSignature(SECRET, header, body, { now: NOW })).valid, true);
  assert.deepEqual(parseSignatureHeader(header).v1.length, 2);
});

test('event types include webhook.test', () => {
  assert.deepEqual([...EVENT_TYPES], ['run.completed', 'alert.fired', 'fix.updated', 'proof.updated', 'webhook.test']);
});
