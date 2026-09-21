# Broadcastwell connectors

Put your AI answer measurements where your team already works.

[Broadcastwell](https://broadcastwell.com) measures whether ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode name your B2B software company when buyers ask shortlist questions, and keeps a receipt for every answer. The connectors in this repository read those measurements through the public, read only [Broadcastwell API](https://app.broadcastwell.com/developers) and bring them into the tools you use for reporting and automation.

## What the connectors give you

- **Every measurement, with its evidence.** Runs, run summaries, per question results, receipts with the answer text and cited addresses, who was named instead, cited sources, fixes, history, alerts and proof experiments.
- **Numbers you can quote.** Counts come first and every rate carries its base and interval, for example "13 of 50 answers named the brand, 26.0% (95% interval 15.9 to 39.6)". Connectors pass the API's five field rate object `{ pct, low, high, interval, base }` through untouched.
- **Events as they happen.** Signed webhooks for run.completed, alert.fired, fix.updated and proof.updated, verified with HMAC SHA-256 and a 300 second timestamp window.
- **One source of routes.** Every connector reads the same routes table, generated from the [OpenAPI document](https://app.broadcastwell.com/api/v1/openapi.json).
- **A demo you can run now.** The public demo key `bwp_demo_kalvenor_sample` reads the Kalvenor sample account. Kalvenor is fictional sample data.

## Connectors

| Connector | Folder | What it does |
| --- | --- | --- |
| JavaScript API client | [`packages/api`](packages/api) | `@broadcastwell/api`: a dependency free client for Node, browsers and Google Apps Script, with paging, typed responses and webhook signature verification. |
| n8n nodes | [`packages/n8n-nodes-broadcastwell`](packages/n8n-nodes-broadcastwell) | `n8n-nodes-broadcastwell`: a Broadcastwell node for every read operation and a Broadcastwell Trigger for signed webhooks. |
| Looker Studio connector | [`looker-studio/`](looker-studio/) | Broadcastwell measurements as a Looker Studio data source. |
| Slack app | [`slack/`](slack/) | The /broadcastwell command: your latest scheduled run, with its interval, in Slack. |
| ChatGPT and Claude connector | [app.broadcastwell.com/developers](https://app.broadcastwell.com/developers) | Ask ChatGPT or Claude about your measurements, with receipts. |

## Looker Studio connector

Lives in [`looker-studio/`](looker-studio/). See that folder for setup.

## Slack app

Lives in [`slack/`](slack/). See that folder for setup.

## ChatGPT and Claude connector

Connect ChatGPT or Claude to your Broadcastwell account. Setup is described at [app.broadcastwell.com/developers](https://app.broadcastwell.com/developers).

## Quick start

```sh
git clone https://github.com/Broadcastwell/bw-connectors.git
cd bw-connectors
npm install
node packages/api/examples/demo.mjs
```

The demo reads the fictional Kalvenor sample with the public demo key and prints lines such as:

```
Run baseline-kalvenor-v11, scheduled passes only:
  125 of 518 answers named the brand, 24.1% (95% interval 20.6 to 28.0)
```

To read your own account, create an API key in your account at [app.broadcastwell.com/account](https://app.broadcastwell.com/account) and set `BROADCASTWELL_API_KEY`.

## API basics

- Base URL `https://app.broadcastwell.com/api/v1`, `Authorization: Bearer <key>`.
- Your own data is under `/accounts/me/...`; the demo key reads `/accounts/sample/...`.
- Paging with `limit` (1 to 100) and `pagination.next_cursor`. ETag and `If-None-Match` are supported.
- Errors are `application/problem+json` with `code` and `detail`.
- Limits: 60 requests a minute and 5,000 a day per account key; 30 a minute per address for the demo key.

## Repository layout

```
packages/
  api/                       @broadcastwell/api, the client and the routes table
  n8n-nodes-broadcastwell/   n8n community nodes
looker-studio/               Looker Studio connector
slack/                       Slack app
```

## Development

Node.js 20 or later. From the repository root:

```sh
npm install
npm run build
npm run lint
npm test
```

CI runs the same steps on Node 20 and 22. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Report vulnerabilities to hello@broadcastwell.com. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
