# n8n-nodes-broadcastwell

n8n community nodes for [Broadcastwell](https://broadcastwell.com). Broadcastwell measures whether ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode name your company when buyers ask shortlist questions, and keeps a receipt for every answer.

This package has two nodes:

- **Broadcastwell** reads your measurements: runs, run summaries, questions, receipts, who was named instead, cited sources, fixes, history, alerts and proof experiments. Use it to send results to a sheet, a warehouse, a dashboard or a chat channel.
- **Broadcastwell Trigger** starts a workflow when Broadcastwell sends a signed webhook: a run completed, an alert fired, a fix or a proof experiment was updated.

Numbers are passed through exactly as the API sends them. Every rate is the five field object `{ pct, low, high, interval, base }` next to the integer counts, so a workflow can write "13 of 50 answers named the brand, 26.0% (95% interval 15.9 to 39.6)" without recomputing anything.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger setup](#trigger-setup) · [Try it with the demo key](#try-it-with-the-demo-key) · [Compatibility](#compatibility)

## Installation

In n8n, open **Settings**, **Community nodes**, select **Install**, enter `n8n-nodes-broadcastwell` and confirm. Community nodes are available on self hosted n8n; see the [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

### Broadcastwell API (for the Broadcastwell node)

| Field | Value |
| --- | --- |
| API Key | An account key from your Broadcastwell account at [app.broadcastwell.com/account](https://app.broadcastwell.com/account). Keys look like `bwp_` followed by 64 hex characters. |
| Base URL | Leave as `https://app.broadcastwell.com/api/v1`. |

The key is sent as `Authorization: Bearer <key>`. Saving the credential calls `GET /me` to check it.

To try the node before you have a key, use the public demo key `bwp_demo_kalvenor_sample`. It reads only the Kalvenor sample account. Kalvenor is fictional sample data.

### Broadcastwell Webhook Signing Secret API (for the Broadcastwell Trigger)

| Field | Value |
| --- | --- |
| Signing Secret | The signing secret of your webhook destination, shown in your Broadcastwell account under Webhooks. |

The secret lives in its own credential so it is encrypted by n8n like any other secret and can be shared or rotated without editing the workflow. Saving the credential only checks that a secret is present; use **Send test event** in your account to check it end to end.

## Operations

Every operation except Method and Get Key Info has an **Account** field. It defaults to `me`, the account that owns the key. With the demo key, `me` is read as `sample` automatically.

| Resource | Operation | API route |
| --- | --- | --- |
| Account | Get | `GET /accounts/{account}` |
| Account | Get Key Info | `GET /me` |
| Alert | Get Many | `GET /accounts/{account}/alerts` |
| Displacement | Get Many | `GET /accounts/{account}/runs/{run}/displacement` |
| Fix | Get Many | `GET /accounts/{account}/fixes` |
| Fix | Get Many for Run | `GET /accounts/{account}/runs/{run}/fixes` |
| History | Get (Scope: All Scopes, Account, Engine or Question Type) | `GET /accounts/{account}/history` |
| Method | Get | `GET /method` |
| Proof | Get | `GET /accounts/{account}/proof/{experiment}` |
| Proof | Get Many | `GET /accounts/{account}/proof` |
| Question | Get | `GET /accounts/{account}/runs/{run}/questions/{question}` |
| Question | Get Many | `GET /accounts/{account}/runs/{run}/questions` |
| Receipt | Get | `GET /accounts/{account}/runs/{run}/receipts/{receipt}` |
| Receipt | Get Many (filters: Engine, Pass ID, Question ID, Verdict) | `GET /accounts/{account}/runs/{run}/receipts` |
| Run | Compare | `GET /accounts/{account}/runs/{run}/compare/{other}` |
| Run | Get | `GET /accounts/{account}/runs/{run}` |
| Run | Get Many | `GET /accounts/{account}/runs` |
| Run | Get Summary | `GET /accounts/{account}/runs/{run}/summary` |
| Source | Get Many | `GET /accounts/{account}/runs/{run}/sources` |

**Output.** Operations that return a list output one n8n item per entry. Operations that return one object output one item holding the response's `data`. Field names and values are unchanged. Sample responses also carry `sample: true` and a notice at the top level of the API response; the node outputs the `data` part.

**Paging.** Get Many operations on runs, questions, receipts, displacement, sources and alerts page through `pagination.next_cursor`. Turn on **Return All** to read every page, or set **Limit** (default 50); the node asks for no more than it needs, up to 100 per request.

**Errors.** API errors become n8n errors with the HTTP status, the problem `code` and the API's `detail`, for example `Broadcastwell API 404 not_found`. A 429 is retried once after `Retry-After` when that is 60 seconds or less. Turn on **Continue On Fail** to get the error as an item instead.

**Limits.** An account key allows 60 requests a minute and 5,000 a day. The demo key allows 30 requests a minute per address.

## Trigger setup

1. Add the **Broadcastwell Trigger** node to a workflow and choose the **Events** that should start it: Run Completed, Alert Fired, Fix Updated, Proof Updated and Test Event. Signed events you did not choose are answered with 200 and ignored, so Broadcastwell does not retry them.
2. Open the node and copy the **Production URL**. Your n8n must be reachable over HTTPS from the internet; Broadcastwell only delivers to HTTPS addresses.
3. In Broadcastwell, open your account at [app.broadcastwell.com/account](https://app.broadcastwell.com/account), go to **Webhooks** and select **Add destination**. Paste the Production URL and choose the same events.
4. Copy the **signing secret** shown for the destination. In n8n, create a **Broadcastwell Webhook Signing Secret API** credential, paste the secret and select it in the trigger.
5. Save and activate the workflow.
6. Back in Broadcastwell, select **Send test event**. The workflow runs with a `webhook.test` event.

### What the trigger checks

Every delivery carries `Broadcastwell-Signature: t=<unix seconds>,v1=<hex>`, an HMAC SHA-256 of `<t>.<raw body>` made with the signing secret. The trigger:

- recomputes the HMAC over the exact raw request bytes and compares in constant time,
- rejects a timestamp more than 300 seconds from the n8n server clock,
- answers **401** with `{ "error": "invalid_signature", "reason": "..." }` and does not start the workflow when any check fails. Reasons: `missing_header`, `malformed_header`, `stale_timestamp`, `signature_mismatch`, `missing_secret`.

The workflow receives the envelope `{ id, type, api_version, created_at, account_id, data }` plus a `headers` object with `event`, `event_id`, `delivery` and `signature_timestamp`. Use `id` or `event_id` to drop duplicates if a delivery is retried.

### Raw body

The HMAC must be computed over the bytes Broadcastwell sent, not over JSON that n8n parsed and re-serialised. The trigger reads, in order:

1. `this.getRequestObject().rawBody`, the Buffer n8n keeps for webhook requests;
2. `readRawBody()` on the request, when n8n has not read the body yet;
3. as a last resort, the parsed body serialised again with `JSON.stringify`. This matches only when the delivered JSON was compact with the same key order; otherwise verification fails with 401, which is the safe outcome.

If signatures fail behind a proxy, check that nothing in front of n8n rewrites the body (compression is fine; reformatting JSON is not) and that the n8n server clock is correct.

### Why there is no automatic registration

Destinations are added by the account owner in the Broadcastwell account, not through the API, so activating the workflow does not register anything. The trigger's webhook lifecycle methods are present, as n8n requires, and do nothing.

## Try it with the demo key

1. Create a **Broadcastwell API** credential with the key `bwp_demo_kalvenor_sample`.
2. Add a **Broadcastwell** node: Resource **Run**, Operation **Get Many**, Account `me`. Run it: three runs from the fictional Kalvenor sample.
3. Switch to Operation **Get Summary** with Run ID `baseline-kalvenor-v11`. The `scheduled.named_rate` field reads `125 of 518 answers`, 24.1% (95% interval 20.6 to 28.0).
4. Try Resource **Receipt**, Operation **Get Many**, with the filters Engine **Perplexity** and Verdict **Not Named** to read the answers that named someone else.

## Compatibility

- Built and linted with `@n8n/node-cli` 0.48.6 against `n8n-workflow` 2.39.3, the version used by n8n 2.39, `n8nNodesApiVersion` 1. Recent n8n 1.x releases with themed icons should also load it; that has not been tested.
- Version 0.1.0 is tested with n8n's function contracts stubbed and against the live API, not yet inside a running n8n instance.
- Node.js 20 or later.
- No runtime dependencies. The node is usable as a tool by n8n AI agents.

## How this package is built

The API routes come from [`@broadcastwell/api`](../api) in this repository, which generates them from the [OpenAPI document](https://app.broadcastwell.com/api/v1/openapi.json). Verified community nodes may not have runtime dependencies, so `scripts/sync-routes.mjs` copies the routes table into `nodes/shared/broadcastwell.generated.ts` at build time instead of importing the package. `npm run lint` fails if the copy is stale.

```sh
npm install           # from the repository root
npm run build         # sync routes, compile with n8n-node build
npm run lint          # n8n-node lint plus the copy checks
npm test              # node:test against the compiled output
node scripts/live-demo.mjs transcript.md   # every operation against the live API with the demo key
```

Publishing steps for maintainers are in [PUBLISHING.md](PUBLISHING.md).

## Resources

- [Broadcastwell API documentation](https://app.broadcastwell.com/developers)
- [OpenAPI document](https://app.broadcastwell.com/api/v1/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
