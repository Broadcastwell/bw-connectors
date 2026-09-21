# Test fixtures

Every file here was captured on 21 September 2026 from the live Broadcastwell API with the public demo key `bwp_demo_kalvenor_sample`, by `scripts/capture-fixtures.mjs`.

**Kalvenor is fictional sample data.** Kalvenor Systems, its competitors and every `.example` domain in these files are made up. Each file carries a `_note` saying so, the request it answers, the status and the headers that matter (content type, `Retry-After`, `RateLimit-*`), and the response body unchanged.

| File | Request |
| --- | --- |
| `me.json` | `GET /me` |
| `runs-page1.json`, `runs-page2.json` | `GET /accounts/sample/runs?limit=2`, then the next cursor |
| `runs-all.json` | `GET /accounts/sample/runs?limit=100` |
| `history-account.json`, `history-engine.json`, `history-question-type.json` | `GET /accounts/sample/history?scope=...` |
| `summary.json` | `GET /accounts/sample/runs/kalvenor-monitor/summary` |
| `summary-with-adaptive.json` | `GET /accounts/sample/runs/baseline-kalvenor-v11/summary` (has an adaptive block) |
| `displacement-page1.json`, `displacement-page2.json` | `GET .../displacement?limit=3`, then the next cursor |
| `sources-page1.json`, `sources-page2.json` | `GET .../sources?limit=5`, then the next cursor |
| `alerts.json` | `GET /accounts/sample/alerts?limit=100` |
| `error-400.json`, `error-401.json`, `error-404-account.json`, `error-404-run.json` | Problem details for a bad limit, a rejected key, an unknown account and an unknown run |

The test harness ignores `limit` when it looks a fixture up, and ends the displacement and sources chains after their second page, so paging is tested over exactly two pages.
