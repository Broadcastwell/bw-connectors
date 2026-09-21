# @broadcastwell/api

A small JavaScript client for the [Broadcastwell API](https://app.broadcastwell.com/developers). No dependencies. Works in Node 18 and later, browsers and workers. Google Apps Script code that must return synchronously, such as a Looker Studio connector, uses the shared routes table instead (see looker-studio/).

Broadcastwell measures whether ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode name a B2B software company when buyers ask shortlist questions, and keeps a receipt for every answer. This client reads those measurements: runs, summaries, questions, receipts, who was named instead, cited sources, fixes, history, alerts and proof experiments.

- One method per API route, generated from the [OpenAPI document](https://app.broadcastwell.com/api/v1/openapi.json).
- `paginate()` follows `pagination.next_cursor` for you.
- Problem details become a `BroadcastwellApiError` with `status`, `code`, `detail` and `retryAfter`.
- A 429 is retried once after `Retry-After`.
- ETag support through `If-None-Match`.
- `verifyWebhookSignature()` checks the `Broadcastwell-Signature` header with WebCrypto.
- Numbers come back exactly as the API sends them. Every rate is the five field object `{ pct, low, high, interval, base }`, next to the integer counts.

## Install

```sh
npm install @broadcastwell/api
```

The package is not on npm yet. Until it is, install it from this repository:

```sh
git clone https://github.com/Broadcastwell/bw-connectors.git
cd bw-connectors/packages/api
npm link
```

## Try it with the demo key

The public demo key `bwp_demo_kalvenor_sample` reads only the Kalvenor sample account, account id `sample`. Kalvenor is fictional sample data. With the demo key the client uses `sample` as its account automatically.

Save this as `try.mjs` and run `node try.mjs`:

```js
import { createClient, DEMO_KEY } from '@broadcastwell/api';

const client = createClient({ apiKey: DEMO_KEY });

const runs = await client.listRuns({ limit: 5 });
for (const run of runs.data) console.log(run.run_id, run.kind, run.status);

const summary = await client.getRunSummary({ run: 'baseline-kalvenor-v11' });
const rate = summary.data.scheduled.named_rate;
// 125 of 518 answers named the brand, 24.1% (95% interval 20.6 to 28.0)
console.log(`${rate.base} named the brand, ${rate.pct.toFixed(1)}% (95% interval ${rate.interval})`);
```

The same with `require`:

```js
const { createClient, DEMO_KEY } = require('@broadcastwell/api');
createClient({ apiKey: DEMO_KEY })
  .getMe()
  .then((me) => console.log(me.data));
```

A longer walkthrough is in [examples/demo.mjs](examples/demo.mjs): `node examples/demo.mjs`.

## Your own account

Create a key in your account at [app.broadcastwell.com/account](https://app.broadcastwell.com/account). Account keys look like `bwp_` followed by 64 hex characters. Keep the key on a server; do not ship it to a browser.

```js
const client = createClient({ apiKey: process.env.BROADCASTWELL_API_KEY });
// account defaults to "me", your own account
const runs = await client.listRuns();
```

## Methods

Every method takes one params object and an optional options object. `account` defaults to the client's account (`me`, or `sample` with the demo key).

| Method | Route |
| --- | --- |
| `getMe()` | `GET /me` |
| `getMethod()` | `GET /method` (no key needed) |
| `getAccount({ account })` | `GET /accounts/{account}` |
| `listRuns({ limit, cursor })` | `GET /accounts/{account}/runs` |
| `getRun({ run })` | `GET /accounts/{account}/runs/{run}` |
| `getRunSummary({ run })` | `GET /accounts/{account}/runs/{run}/summary` |
| `listQuestions({ run, limit, cursor })` | `GET /accounts/{account}/runs/{run}/questions` |
| `getQuestion({ run, question })` | `GET /accounts/{account}/runs/{run}/questions/{question}` |
| `listReceipts({ run, question_id, engine, pass_id, verdict, limit, cursor })` | `GET /accounts/{account}/runs/{run}/receipts` |
| `getReceipt({ run, receipt })` | `GET /accounts/{account}/runs/{run}/receipts/{receipt}` |
| `listDisplacement({ run, limit, cursor })` | `GET /accounts/{account}/runs/{run}/displacement` |
| `listSources({ run, limit, cursor })` | `GET /accounts/{account}/runs/{run}/sources` |
| `listRunFixes({ run })` | `GET /accounts/{account}/runs/{run}/fixes` |
| `compareRuns({ run, other })` | `GET /accounts/{account}/runs/{run}/compare/{other}` |
| `listFixes()` | `GET /accounts/{account}/fixes` |
| `getHistory({ scope })` | `GET /accounts/{account}/history`, scope `account`, `engine` or `question_type` |
| `listAlerts({ limit, cursor })` | `GET /accounts/{account}/alerts` |
| `listProof()` | `GET /accounts/{account}/proof` |
| `getProof({ experiment })` | `GET /accounts/{account}/proof/{experiment}` |

Engine ids for the `engine` filter: `chatgpt`, `claude`, `perplexity`, `google_aio`, `google_ai_mode`. `ENGINES` maps them to their labels: ChatGPT, Claude, Perplexity, Google AI Overviews, Google AI Mode. Verdicts: `named`, `not_named`, `excluded`.

### Paging

`limit` is 1 to 100. `paginate(method, params)` yields every item across pages:

```js
for await (const receipt of client.paginate('listReceipts', { run: 'baseline-kalvenor-v11', verdict: 'not_named', limit: 100 })) {
  console.log(receipt.engine_label, receipt.question_id, receipt.competitors_found);
}
```

Pass `{ maxItems }` as the third argument to stop early.

### Errors

```js
import { BroadcastwellApiError } from '@broadcastwell/api';

try {
  await client.getRun({ run: 'no-such-run' });
} catch (err) {
  if (err instanceof BroadcastwellApiError) {
    console.log(err.status, err.code, err.detail); // 404 not_found No run with that id ...
  }
}
```

Codes you will meet: `unauthorized` and `key_revoked` (401), `not_found` (404), `run_not_delivered` (409), `rate_limited` (429, with `retryAfter` in seconds). A 429 is retried once when `Retry-After` is 60 seconds or less; set `retryOn429: false` to turn that off. Limits: the demo key allows 30 requests a minute per address; an account key allows 60 a minute and 5,000 a day.

### ETags

```js
import { getResponseMeta, isNotModified } from '@broadcastwell/api';

const run = await client.getRun({ run: 'baseline-kalvenor-v11' });
const { etag, rateLimit } = getResponseMeta(run);
const again = await client.getRun({ run: 'baseline-kalvenor-v11' }, { ifNoneMatch: etag });
if (isNotModified(again)) console.log('unchanged');
```

## Webhooks

Register a destination in your account under Webhooks at [app.broadcastwell.com/account](https://app.broadcastwell.com/account). HTTPS only. Copy the signing secret shown there.

Each delivery is a JSON envelope `{ id, type, api_version, created_at, account_id, data }` with the headers `Broadcastwell-Signature`, `Broadcastwell-Event`, `Broadcastwell-Event-Id` and `Broadcastwell-Delivery`. Event types: `run.completed`, `alert.fired`, `fix.updated`, `proof.updated`, `webhook.test`.

Verify against the raw body, before parsing it:

```js
import http from 'node:http';
import { verifyWebhookSignature } from '@broadcastwell/api';

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const check = await verifyWebhookSignature(
    process.env.BROADCASTWELL_SIGNING_SECRET,
    req.headers['broadcastwell-signature'],
    raw,
  );
  if (!check.valid) {
    res.writeHead(401).end(check.reason);
    return;
  }
  const event = JSON.parse(raw.toString('utf8'));
  console.log(event.type, event.id);
  res.writeHead(200).end('ok');
}).listen(3000);
```

The signature is HMAC SHA-256 of `<t>.<raw body>` with the signing secret, sent as `t=<unix seconds>,v1=<hex>`. The helper rejects timestamps more than 300 seconds from your clock and compares in constant time. `signWebhookPayload(secret, rawBody, t)` builds a header, which helps when testing a receiver.

## The routes table

`routes` is the one place that knows the routes. It is generated from the OpenAPI document and used by this client and by the other connectors in this repo, including the n8n node, which copies it at build time.

```js
import { routes, buildPath, buildQuery } from '@broadcastwell/api';

routes.listReceipts;
// { name: 'listReceipts', method: 'GET', path: '/accounts/{account}/runs/{run}/receipts',
//   pathParams: [...], queryParams: [{ name: 'question_id', ... }, ...], paged: true, returns: 'page', ... }
buildPath('listReceipts', { account: 'sample', run: 'baseline-kalvenor-v11' });
buildQuery('listReceipts', { verdict: 'not_named', limit: 50 }); // ?verdict=not_named&limit=50
```

## Builds

| File | For |
| --- | --- |
| `src/index.mjs` | ES modules (`import`) |
| `dist/index.cjs` | CommonJS (`require`) |
| `dist/broadcastwell.global.js` | A plain script that defines a `Broadcastwell` global: script tags and Google Apps Script. In Apps Script, where entry points must return synchronously, use its `routes` and path helpers with `UrlFetchApp`, as the Looker Studio connector does. |
| `types.d.ts` | TypeScript types for every schema, parameter set and response |

The source is written as ES modules. `scripts/build.mjs` makes the CommonJS and script copies by stripping the import and export lines, so there is no bundler and no dependency; the committed copies are checked for staleness in CI.

## Regenerating from the OpenAPI document

```sh
npm run generate:fetch   # download the live document into openapi.json, then regenerate
npm run build            # regenerate routes and types from the committed openapi.json, then build
npm test
```

`scripts/generate-types.mjs` has no dependencies. It writes `src/routes.mjs` and `types.d.ts`.

## License

MIT
