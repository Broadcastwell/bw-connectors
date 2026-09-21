# Changelog

## 0.1.0

- Broadcastwell node: account, key info, method, runs (get, get many, summary, compare), questions, receipts with filters, displacement, sources, fixes per account and per run, history by scope, alerts and proof experiments. Return All and Limit follow `pagination.next_cursor`.
- Broadcastwell Trigger: signed webhooks for run.completed, alert.fired, fix.updated, proof.updated and webhook.test, with HMAC SHA-256 verification and a 300 second timestamp tolerance.
- Credentials: Broadcastwell API (API key, base URL) and Broadcastwell Webhook Signing Secret API.
