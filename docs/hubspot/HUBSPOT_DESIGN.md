# HubSpot app: design

Status: design only. Nothing is built, registered or listed. Written 21 September 2026 for a later run.

Sources: the HubSpot pages read for the directory research on 21 September 2026 (app marketplace listing requirements; the May 2026 listing and certification changelog; the legacy apps changelog; the install limits changelog), plus developers.hubspot.com pages on app configuration, fetching data from UI extensions, the webhooks journal and the Fall 2026 spotlight. Anything not confirmed on a HubSpot page is marked **verify**.

## 1. What it does

A Broadcastwell customer installs the app in their HubSpot account and links it to their Broadcastwell account. Then:

1. **An app card on company records.** When the company's domain matches a Broadcastwell account the link can read, the card shows that account's latest scheduled headline, the top three competitors named instead, and a link to the receipts.
2. **Company properties.** The same figures are written to custom company properties, so they can be used in lists, reports, workflows and views without opening the card.

Who it is for:

- A software company that has its own company record in HubSpot (common: the record used for partner and investor reporting).
- A team that looks after several measured brands, each a Broadcastwell account readable by one grant, each with its company record. Matching by domain gives each record its own figures.

Example card, with the fictional Kalvenor sample (Kalvenor is fictional sample data):

```
Broadcastwell: Kalvenor Systems (sample data)
Latest scheduled run, measured 12 August 2026

Named in 30 of 150 answers, 20.0% (95% interval 14.4 to 27.1)
ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode

Named instead, in answers without Kalvenor (120 answers)
  Northvale FSM   94 of 120
  Trakwell        38 of 120
  Asterforge      32 of 120

[See the receipts]   Last synced 21 September 2026, 06:00 UTC
```

Rules the card follows: the count comes before the rate, the rate always carries its base and 95% interval, engines are named in full, figures are scheduled runs only (adaptive answers are never added in and are not shown on the card), and no figures are blended into a single number. "Moved up" or "Moved down" appears only when the API's history says the two intervals separate.

## 2. App model

- **Build on the projects based developer platform, not a legacy public app.** Public apps built on the pre projects architecture went unsupported on 15 September 2026, and delisting enforcement is set for September 2027.
- **Platform version.** New marketplace listings from 2 November 2026 must be on platform **v2025.2 or v2026.03**; legacy apps and projects 2023.2 and 2025.1 are rejected. The legacy apps changelog also says projects on 2025.2 and older must move to **2026.09** by March 2027, and 2026.09 went generally available on 15 September 2026 with an 18 month support window. Plan: build on **2026.09**; if the marketplace review does not yet accept 2026.09 for a new listing, set **2026.03** (accepted, first date based version, released 30 March 2026) and move to 2026.09 before March 2027. **Verify** with HubSpot which versions the listing form accepts on the build date.
- **App cards, not classic CRM cards.** Classic (legacy) CRM cards are not allowed for new listings, certification or recertification; they were deprecated 16 June 2025 and are fully removed 31 October 2026. The card is a project **app card** (UI extension, React), placed on the company record.
- **OAuth distribution** (marketplace), not a user level app and not a service key. The app acts for the HubSpot account, not for one HubSpot user.

Project layout (2025.2 and later style, one `*-hsmeta.json` per feature):

```
broadcastwell-hubspot/
  hsproject.json                 platformVersion "2026.09" (or "2026.03")
  src/app/
    app-hsmeta.json              uid, distribution "marketplace", auth type oauth,
                                 redirectUrls, requiredScopes, permittedUrls.fetch
    cards/
      headline-hsmeta.json       type "card", location crm.record.tab (and the sidebar
                                 preview), objectTypes ["companies"], entrypoint
      Headline.jsx               the card
```

`permittedUrls.fetch` lists one prefix: `https://app.broadcastwell.com/hubspot/`. Fetch entries are prefixes, wildcards are not allowed, and anything else answers 403.

## 3. The app card

**Data path.** The card never holds a Broadcastwell token.

1. The card reads the record's `domain` with the UI extension's CRM properties helper.
2. It calls `hubspot.fetch('https://app.broadcastwell.com/hubspot/card', { method: 'POST', body: { domain } })`. HubSpot adds `portalId`, `userId`, `userEmail` and `appId`, and signs the request with `X-HubSpot-Signature-v3`.
3. The Broadcastwell backend checks the v3 signature and its timestamp with the app's client secret, finds the installation by `portalId`, finds the linked account whose measured domain matches, and answers from the latest synced snapshot (section 6). It does not call HubSpot and does not need `userEmail`; it is not stored or logged.
4. Limits from HubSpot's fetching data page: 15 second default timeout (up to 120 seconds), 20 concurrent requests per app per account (more answer 429), 1 MB request and response, one automatic retry on a connection error or 5xx. The endpoint answers from the database only, so it stays well inside these.

**States the card shows.**

| State | Card text |
| --- | --- |
| Figures available | The headline, three named instead lines, the receipts link, the last synced time |
| Domain not measured | "Broadcastwell has no measurement for this company's domain. Measured domains for this account: ..." |
| No domain on the record | "Add the company domain to see Broadcastwell figures." |
| Not linked yet | "Link this HubSpot account to Broadcastwell to see figures." with a link to the linking page |
| Latest run has no scheduled passes | "No scheduled run has been delivered yet." |
| Link revoked or expired | "The link to Broadcastwell has ended. Link again to see figures." |

**Receipts link.** Opens the account's run on app.broadcastwell.com, filtered to the answers behind the headline. The exact public path is an open question (section 13).

**Matching by domain.** Company `domain` (and `hs_additional_domains` when present) is lowercased, stripped of `www.` and any path, and compared with the account's measured domain. The public API does not expose an account's measured domain today (`GET /accounts/{account}` returns id, name and run count); section 13 lists the small additive API change this needs.

## 4. Company properties

Created at install in a property group `broadcastwell` ("Broadcastwell"). All read only in the HubSpot UI where the Properties API allows it (**verify** the flag on the build date), and all written only by the app.

| Internal name | Label | Type / field type | Example (fictional Kalvenor sample) |
| --- | --- | --- | --- |
| `bw_named_count` | Broadcastwell: answers naming the company | number / number | 30 |
| `bw_scored_count` | Broadcastwell: answers scored | number / number | 150 |
| `bw_named_pct` | Broadcastwell: named rate % | number / number | 20.0 |
| `bw_interval_low` | Broadcastwell: 95% interval low | number / number | 14.4 |
| `bw_interval_high` | Broadcastwell: 95% interval high | number / number | 27.1 |
| `bw_named_base` | Broadcastwell: base | string / text | 30 of 150 answers |
| `bw_headline` | Broadcastwell: headline | string / textarea | Named in 30 of 150 answers, 20.0% (95% interval 14.4 to 27.1) |
| `bw_measured_on` | Broadcastwell: measured on | date / date | 2026-08-12 |
| `bw_run_id` | Broadcastwell: run id | string / text | kalvenor-monitor |
| `bw_method_version` | Broadcastwell: method version | string / text | 1.1 |
| `bw_top_named_instead` | Broadcastwell: named instead (top three) | string / textarea | Northvale FSM 94 of 120; Trakwell 38 of 120; Asterforge 32 of 120 |
| `bw_top_named_instead_1` | Broadcastwell: most named instead | string / text | Northvale FSM |
| `bw_top_named_instead_1_count` | Broadcastwell: most named instead, answers | number / number | 94 |
| `bw_answers_without_company` | Broadcastwell: answers without the company | number / number | 120 |
| `bw_receipts_url` | Broadcastwell: receipts | string / text | link to the run's receipts on app.broadcastwell.com |
| `bw_account_id` | Broadcastwell: account id | string / text | sample |
| `bw_last_synced` | Broadcastwell: last synced | datetime / date | 2026-09-21T06:00:00Z |

Notes:

- Counts are integers; percentages and interval ends are written exactly as the API returns them (one decimal), never recomputed.
- No property blends figures into one number, and there is no "change" property: movement lives in the API history and is shown on the card only where intervals separate.
- Date values are sent as midnight UTC, as HubSpot requires for date properties.
- `bw_top_named_instead_1` exists so a workflow or list can filter on a single competitor without parsing text.

## 5. Install, OAuth and linking

**HubSpot side.** Standard OAuth code flow for a marketplace app:

1. The customer clicks Install (marketplace listing or the install link on app.broadcastwell.com/developers).
2. HubSpot asks them to choose an account and approve the scopes, then redirects to `https://app.broadcastwell.com/hubspot/oauth/callback?code=...` with our `state`.
3. The backend exchanges the code for tokens at HubSpot's token endpoint. Use the new versioned endpoint `POST /oauth/2026-03/token`, which HubSpot names in its certification requirements; the older `/oauth/v1/token` path is the fallback until **verified**.
4. It reads the token's metadata (hub id, hub domain, scopes) and stores the installation (section 7).

**Scopes, as few as the features need:**

| Scope | Why |
| --- | --- |
| `oauth` | Required on every HubSpot OAuth app (**verify** it is still listed separately on the chosen platform version) |
| `crm.objects.companies.read` | Find companies by domain, read `domain` |
| `crm.objects.companies.write` | Write the `bw_*` properties |
| `crm.schemas.companies.read` | Check the `bw_*` properties exist and have the right types |
| `crm.schemas.companies.write` | Create the property group and properties at install |

No contact, deal, ticket or sensitive data scopes. The listing's shared data table documents exactly one object: companies. If HubSpot allows creating the properties from the project definition itself (app objects and property definitions in projects are growing), `crm.schemas.companies.write` can move to optional; **verify** on the build date.

**Broadcastwell side: linking a portal to an account.** Reuse the OAuth 2.1 server already on app.broadcastwell.com (the one the ChatGPT and Claude connector uses):

1. Right after the HubSpot callback, the backend starts a Broadcastwell authorization request as a **first party client** (`hubspot-app`, registered in the platform's client table, confidential, PKCE S256, `resource` set to the API).
2. The customer signs in to Broadcastwell if needed and sees one consent screen: "HubSpot account <hub domain> will read <account name> measurements: runs, summaries, who was named instead and receipts. Read only." They pick the accounts to share if the grant can read more than one.
3. The callback stores the Broadcastwell **grant id** against the HubSpot installation. The grant is revocable from the Broadcastwell account's connected apps list like any other.
4. The HubSpot backend reads measurements with that grant, through the same public API routes every connector uses. No second read path.

If the HubSpot install happens without a Broadcastwell sign in (for example an admin installs and closes the tab), the installation is stored as "not linked" and the card shows the "Link this HubSpot account" state.

## 6. Data sync

- **On `run.completed`.** The platform already emits this event for webhooks. The HubSpot worker subscribes internally, finds installations linked to the account, reads `GET /accounts/{account}/runs/{run}/summary` and `.../displacement` (all pages), builds the snapshot, and writes it to every matching company in each portal.
- **Daily reconcile at 06:00 UTC.** For each linked installation: resolve the latest delivered run with scheduled passes (the same rule as the Looker Studio connector's Latest run), rebuild the snapshot, write only where values changed (compare a hash of the property values with the last write). This repairs missed events, new company records and edits that cleared properties.
- **On install and on link.** One immediate sync.
- **The card reads the snapshot**, never HubSpot and never the API live, so it is fast and does not use API quota.

Writes: find companies with the CRM search endpoint (`domain` equal to the measured domain), then `POST /crm/v3/objects/companies/batch/update` in batches of up to 100. A domain with several company records gets all of them written; the card shows the same figures on each.

The word "latest" in the UI always means the latest synced run, with its measured on date and last synced time printed beside it. Nothing claims to be instant.

## 7. What is stored, and how

Stored in the private platform repository's database, not in this public repository.

`hubspot_installations`

| Column | Notes |
| --- | --- |
| `portal_id` | HubSpot hub id, primary key |
| `hub_domain` | From token metadata, for display on the consent screen and the connected apps list |
| `app_id` | HubSpot app id, to reject signed requests for another app |
| `refresh_token_sealed` | AES-256-GCM ciphertext and tag |
| `refresh_nonce` | 12 random bytes per seal |
| `access_token_sealed`, `access_nonce`, `access_expires_at` | Optional cache of the short lived access token (about 30 minutes, **verify**), same sealing |
| `seal_version` | `1`, so the key can be rotated |
| `scopes` | As granted |
| `installed_at`, `linked_at`, `uninstalled_at` | |
| `bw_grant_id` | The Broadcastwell grant that reads the accounts |
| `status` | `active`, `not_linked`, `link_revoked`, `uninstalled`, `token_invalid` |
| `last_synced_at`, `last_error_code` | For support; no response bodies |

`hubspot_company_links`: `portal_id`, `bw_account_id`, `hubspot_company_id`, `domain`, `values_hash`, `written_at`.

`hubspot_snapshots`: `bw_account_id`, `run_id`, `measured_on`, the headline counts and rate object, the top three named instead with counts, `built_at`. One row per account; the card and the sync both read it.

Not stored: HubSpot user emails, contact data, any company property other than `domain`.

**Sealing.** AES-256-GCM with a key derived by HKDF-SHA256 from the platform's existing bound secret, with the distinct info label `bw-connect hubspot-at-rest v1` and a fixed salt, so this key cannot be confused with any other key derived from the same secret. The additional authenticated data is `portal_id` plus the column name, so a sealed token cannot be moved to another row or column and still open. A random 12 byte nonce per seal. No new platform secret is added. The one new secret is the HubSpot app's **client secret**, which the owner puts in the platform's secret store (section 11); it is used for the token exchange, refresh and checking `X-HubSpot-Signature-v3`.

## 8. Token refresh

- Refresh when the stored access token has under 5 minutes left, or on a 401 from HubSpot, at most once per request.
- One refresh at a time per portal (a row lock or advisory lock on `portal_id`), so parallel sync jobs do not race and invalidate each other.
- If HubSpot returns a new refresh token, seal and store it in the same transaction.
- `invalid_grant` or a 401 after a fresh refresh: mark `token_invalid`, stop syncing that portal, show the "link has ended" card state, and keep the row for 30 days in case of reinstall.

## 9. Uninstall and disconnect

- **Uninstall in HubSpot.** HubSpot removes the app's cards and webhook subscriptions on uninstall. The backend learns of it from the app lifecycle events (`app_uninstall`, event type id `4-1916193`) read from the Webhooks journal API, polled every 15 minutes, and also from `invalid_grant` on the next refresh. On either: set `uninstalled`, delete the sealed tokens at once, revoke the Broadcastwell grant, delete `hubspot_company_links` and stop syncing. The `bw_*` property values stay in the customer's HubSpot (they are the customer's data now); the setup page says how to delete the property group.
- **Disconnect from Broadcastwell.** Revoking the grant in the Broadcastwell account calls HubSpot's uninstall API, `DELETE /appinstalls/v3/external-install`, which HubSpot's certification requirements name, then does the same cleanup.
- **Reinstall** creates a fresh row state; the old sealed tokens are already gone.

## 10. Rate limits

- **HubSpot.** OAuth apps: 110 requests per 10 seconds per HubSpot account (**verify** the current figure on the build date). CRM search has its own lower per second limit (**verify**). The sync uses one search per measured domain and one batch update per 100 companies, so a portal with one to ten measured brands needs a handful of calls per run. On 429, back off with the `Retry-After` header and jitter; jobs are queued per portal.
- **HubSpot to Broadcastwell (card fetch).** 20 concurrent requests per app per account. The card endpoint answers from the snapshot table.
- **Broadcastwell API.** A run sync reads the summary and one or two displacement pages. The worker spaces calls and honours `Retry-After` like every other connector.

## 11. Marketplace listing requirements

From HubSpot's listing requirements and the May 2026 changelog:

- **3 active, unique installs** from production HubSpot accounts not affiliated with Broadcastwell, each with successful OAuth API calls or signed webhook activity in the last 30 days.
- **Install cap of 25** until listed, for apps created on or moved to 2025.2 and later.
- **OAuth only; only the scopes the app uses;** every object in the scopes documented in the shared data table (companies).
- **App cards, not classic CRM cards;** no HubSpot logos or branding in names; no sensitive data scopes; destructive buttons styled as destructive.
- **Listing content:** setup documentation specific to HubSpot, install button URL, pricing that matches the website, support contact, privacy policy and terms URLs, shared data table, URLs of 250 characters or fewer. Icon and screenshot sizes were not stated on the page read (**verify** in the listing form).
- **Demo videos** showing the core flows, configuration and permission use. Since 31 March 2026 these replace test credentials.
- **One listing, one app;** it must not redirect to or require another app.
- **Review:** first response within 10 business days; 60 days at most from feedback; one submission at a time.
- **Certification** (later, optional): the uninstall API, a security questionnaire, the new versioned token endpoint, and no v1 to v4 APIs after March 2027.

## 12. Owner steps

1. Create a free HubSpot developer account under a Broadcastwell email, and a free developer test account for building.
2. Install the HubSpot CLI, sign in (`hs account auth`), create the project from section 2 and upload it (`hs project upload`). HubSpot issues the app id, client id and **client secret**.
3. Put the client secret in the platform's secret store as the HubSpot app secret. It never goes into a repository.
4. Set the redirect URL `https://app.broadcastwell.com/hubspot/oauth/callback` and the fetch prefix `https://app.broadcastwell.com/hubspot/` in the app configuration.
5. Register `hubspot-app` as a first party client in the Broadcastwell OAuth server.
6. Add the measured domain to accounts (section 13), then build and ship the backend in the platform repository.
7. Record the demo videos; write the setup page on app.broadcastwell.com/developers; fill the shared data table; get three unaffiliated customers to install and use it; submit the listing.

## 13. Open questions

1. **Measured domain on the account.** Add `domain` (and any alias domains) to `GET /accounts/{account}` as an additive v1 field. Until then the backend can take it from the account's own domain inside the platform, but the public API should carry it so every connector matches the same way.
2. **Receipts deep link.** Which public app.broadcastwell.com path opens a run's receipts filtered to scheduled answers?
3. **Platform version accepted for new listings** on the build date: 2026.09, or 2026.03 only.
4. **Token endpoint.** Is `POST /oauth/2026-03/token` required for a basic listing or only for certification?
5. **Property creation.** Can project app definitions create company properties, which would drop `crm.schemas.companies.write`?
6. **Several company records per domain.** Write all (the plan), or only the oldest, or ask at link time?
7. **Agencies.** One HubSpot account, many Broadcastwell accounts: is one grant across accounts enough, or one link per account?
8. **Uninstall signal.** When the v3 Webhooks API gets app lifecycle events, switch from polling the journal.
9. **Pricing text** for the listing must match the website; owner to supply.

## 14. Effort estimate

| Piece | Days |
| --- | --- |
| Project, app config, card UI with all states | 3 |
| OAuth install, token store with sealing, refresh, uninstall and disconnect | 3 |
| Broadcastwell first party client, consent screen, grant linking | 2 |
| Property group and properties, search and batch writes, snapshot builder | 2 |
| `run.completed` hook, daily reconcile, queue and backoff | 2 |
| Signature checks, tests with fixtures, end to end in a developer test account | 3 |
| Setup page, shared data table, demo videos, listing copy | 2 |
| **Total** | **about 17 working days**, plus HubSpot review time and the wait for three unaffiliated installs |

## 15. Risks

- **Three unaffiliated installs** is the gating item, not the code. Line up customers before building.
- **Platform version churn.** 2025.2 must move to 2026.09 by March 2027; starting on the newest accepted version limits rework.
- **Domain matching** is only as good as the company records. Missing or messy domains leave the card in its "add the domain" state; the reconcile catches new records daily.
- **Stale figures if an event is missed.** The daily reconcile bounds this to one day, and the card always prints measured on and last synced.
- **Token handling.** Refresh races and leaked tokens are the main security risk. Mitigated by per portal locks, sealing with a purpose bound key and row bound AAD, deletion on uninstall, and never logging token or response bodies.
- **Signature checking** on the card endpoint must use the v3 scheme with a timestamp window; a mistake would let anyone read a portal's snapshot by guessing a portal id.
- **Copy drift.** Every string on the card and in the properties follows the house rules in this document: counts first, base and interval with every rate, engines named exactly, no blended single number, no claims of instant updates.
