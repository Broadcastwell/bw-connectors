# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

Node.js 20 or later.

```sh
npm install
npm run build
npm run lint
npm test
```

## Ground rules

- **Routes come from the OpenAPI document.** Do not hand edit `packages/api/src/routes.mjs`, `packages/api/types.d.ts` or `packages/n8n-nodes-broadcastwell/nodes/shared/broadcastwell.generated.ts`. Run `npm run generate:fetch` in `packages/api` to pull the live document, then `npm run build` in each package. CI fails if a generated file is stale.
- **No runtime dependencies** in either package. The n8n node must stay free of them to be verified by n8n.
- **Numbers pass through untouched.** Keep the five field rate object and the integer counts as the API sends them.
- **Copy.** In anything a user reads: counts before percentages, every rate with its base and interval; engines named exactly (ChatGPT, Claude, Perplexity, Google AI Overviews, Google AI Mode); no em or en dashes. `npm run lint` checks the dashes.
- **Tests.** Use `node:test`. Tests must not call the live API; the live walkthroughs live in `packages/api/examples/demo.mjs` and `packages/n8n-nodes-broadcastwell/scripts/live-demo.mjs`. Keep live runs under 30 requests a minute when using the demo key.
- **Sample data.** Kalvenor is fictional sample data; say so wherever it appears.

## Pull requests

Keep changes small and describe what changed and why. Add or update tests with every behaviour change.
