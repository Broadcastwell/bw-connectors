# Broadcastwell for Looker Studio

Chart whether ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode name your company, next to the rest of your marketing reporting.

[Broadcastwell](https://broadcastwell.com) asks the questions your buyers ask when they build a shortlist, records every answer with a receipt, and counts how often your B2B software company is named. This Looker Studio data source reads those measurements through the read only [Broadcastwell API](https://app.broadcastwell.com/developers).

> Status: built and tested, not yet published to the Looker Studio connector gallery. You can deploy it to your own Google account in a few minutes; see [DEPLOY.md](DEPLOY.md).

## What you can chart

| Data set | One row per | Good for |
| --- | --- | --- |
| **History** | scheduled run, for the account, each engine or each question type | A time series of how often you are named, with the 95% interval as a band |
| **Run summary** | segment of one run: overall, each engine, each question type | A scorecard and an engine comparison for the latest run |
| **Named instead** | question and competitor | Who buyers hear about when your name is missing |
| **Sources** | page cited in scheduled answers | Which pages the engines lean on, and whether yours is among them |
| **Alerts** | movement between consecutive comparable runs | A list of changes where the two intervals separate |

## Numbers you can quote

- **Counts come first.** Every rate sits next to the integer counts it was computed from: `named`, `scored`, `observed`, `excluded`.
- **Every rate comes with its base and interval.** A rate arrives as five columns: `named_pct`, `named_low`, `named_high`, `named_interval` (text, for example `15.9 to 39.6`) and `named_base` (text, for example `13 of 50 answers`). Put them together as "Named in 13 of 50 answers, 26.0% (95% interval 15.9 to 39.6)".
- **Rates are never summed.** Rate columns have no default aggregation; counts default to SUM.
- **Scheduled runs only.** Headline figures come from scheduled passes. Adaptive answers, which re-ask the pairs whose scheduled verdicts disagreed, are never added in. In Run summary you can tick a box to see them as one extra row marked "Adaptive (shown separately)".
- **Movement is called only where intervals separate.** History marks each point with Moved up, Moved down or No separable change, and flags method breaks.
- **Engines by name.** The Engine column reads ChatGPT, Claude, Perplexity, Google AI Overviews or Google AI Mode.
- **Dates are dates.** `observed_on` is a Looker Studio date (YEAR_MONTH_DAY).

## Try it with the demo key

The public demo key `bwp_demo_kalvenor_sample` reads the Kalvenor sample account. **Kalvenor is fictional sample data.** When Looker Studio asks for a key, paste the demo key and leave Account blank; the connector reads account `sample`.

A run against the live API with the demo key, the way Looker Studio calls the connector, gave for example:

| Segment | Named | Scored | % | 95% interval | Base |
| --- | --- | --- | --- | --- | --- |
| All questions and engines | 30 | 150 | 20 | 14.4 to 27.1 | 30 of 150 answers |
| Claude | 8 | 30 | 26.7 | 14.2 to 44.4 | 8 of 30 answers |
| Google AI Overviews | 6 | 30 | 20 | 9.5 to 37.3 | 6 of 30 answers |

(Run summary, Latest run of the fictional Kalvenor sample.)

## Your own account

1. Create an API key under API keys in your account at [app.broadcastwell.com/account](https://app.broadcastwell.com/account). Keys look like `bwp_` followed by 64 hex characters.
2. Add the Broadcastwell data source in Looker Studio and paste the key. The connector checks it against `GET /me` before saving it.
3. Leave Account blank (or `me`) to read your own account.
4. Pick a data set. For Run summary, Named instead and Sources, pick a run or keep **Latest run**, which follows the newest delivered run with scheduled passes so the report moves on when a new run lands.

The key is kept in your Google account's Apps Script user properties for this connector, and sent only to `https://app.broadcastwell.com/api/v1/` (the manifest allows no other address). To remove it, revoke access to the data source in Looker Studio.

## Good to know

- Answers are cached for five minutes per key and address, because Looker Studio asks once per chart.
- The demo key allows 30 requests a minute from one address. If a report hits the limit, the error says how long to wait. Your own key allows more.
- In Run summary, rows mix grains (overall, engine, question type). Filter to one `segment_type` before adding counts across rows.
- In Named instead, question level counts repeat on each competitor row. Use MAX, not SUM, for them across competitors.

## How it is built

- `src/` holds the connector: `Code.js` (the functions Looker Studio calls), `Api.js` (a synchronous caller over `UrlFetchApp`), `Mapping.js` (pure functions from API JSON to rows) and `Schema.js` (fields per data set).
- `scripts/build.mjs` writes `dist/Code.js`, one file for Apps Script. It prepends a block generated from [`packages/api`](../packages/api): the routes table, the engine labels and the path and query builders. No route is written by hand in this folder.
- `test/` runs the built file in a Node vm with stand ins for DataStudioApp, UrlFetchApp, PropertiesService, CacheService and Utilities, against responses captured from the live API with the demo key.

```sh
cd looker-studio
node scripts/build.mjs          # write dist/
node --test test/*.test.mjs     # 36 tests
node scripts/live-demo.mjs      # call the live API with the demo key, about 14 requests
```

Why not `createClient()` from `packages/api`? It is Promise based, and Looker Studio needs `getData()` to return rows as its value. `UrlFetchApp` is synchronous, so the connector uses the shared routes with a small synchronous caller instead.

## Support

Questions and problems: [app.broadcastwell.com/developers](https://app.broadcastwell.com/developers) or hello@broadcastwell.com. Privacy: [broadcastwell.com/privacy](https://broadcastwell.com/privacy). Terms: [broadcastwell.com/terms](https://broadcastwell.com/terms).

## Licence

MIT. See [LICENSE](../LICENSE).
