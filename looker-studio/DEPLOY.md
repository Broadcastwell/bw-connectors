# Deploying the Broadcastwell Looker Studio connector

Owner steps. Nothing here has been done yet: no Apps Script project exists, nothing is deployed and nothing has been submitted to Google. Everything below is free; clasp is a free command line tool from Google.

Sources, read on 21 September 2026: developers.google.com/looker-studio/connector (build, manifest, auth, stepped configuration, deploy, use, pscc-requirements, publish-connector) and the clasp README (github.com/google/clasp, version 3 command names).

Use a Google account that belongs to Broadcastwell (for example a Workspace account on broadcastwell.com), not a personal one: the Partner review, OAuth verification and ownership of the deployment all hang off it.

## 1. Build

```sh
cd looker-studio
node scripts/build.mjs           # writes dist/Code.js and dist/appsscript.json
node --test test/*.test.mjs      # 36 tests, no network
node scripts/build.mjs --check   # dist/ matches src/ and packages/api
```

`dist/` holds exactly two files: `Code.js` (everything, including the routes generated from `packages/api`) and `appsscript.json` (the manifest).

## 2. Create the Apps Script project

Pick one route.

### Route A: paste in the editor

1. Open [script.new](https://script.new) while signed in to the Broadcastwell Google account. Rename the project **Broadcastwell** (click "Untitled project").
2. Project Settings (gear icon) > tick **Show "appsscript.json" manifest file in editor**. The Partner review needs this ticked.
3. Editor > `Code.gs`: replace everything with the contents of `dist/Code.js`. Save.
4. Editor > `appsscript.json`: replace everything with the contents of `dist/appsscript.json`. Save.

### Route B: clasp

1. Turn on the Apps Script API for the account: [script.google.com/home/usersettings](https://script.google.com/home/usersettings) > Google Apps Script API > On.
2. Install and sign in (the sign in is the owner's, in a browser):
   ```sh
   npm install -g @google/clasp
   clasp login
   ```
3. Create the project with `dist` as the root, from `looker-studio/`:
   ```sh
   clasp create-script --type standalone --title "Broadcastwell" --rootDir dist
   ```
   This writes `.clasp.json` (ignored by git; `.clasp.json.example` shows its shape). If a `dist/appsscript.json` prompt appears, keep the local file.
4. Push:
   ```sh
   node scripts/build.mjs && clasp push
   ```
   `clasp push` uploads `dist/Code.js` as `Code.gs` and the manifest. Run the same two commands after every change.
5. `clasp open-script` opens the editor. Tick **Show "appsscript.json" manifest file in editor** in Project Settings.

## 3. Test with the head deployment

1. In the editor: **Deploy > Test deployments**. Copy the **Head Deployment ID**. The head deployment always runs the current saved code.
2. Open `https://lookerstudio.google.com/datasources/create?connectorId=<HEAD_DEPLOYMENT_ID>` (Google's page still shows the older `datastudio.google.com` host; both open the same place).
3. Authorise the script when asked. The consent screen should list one permission: connect to an external service (`script.external_request`).
4. Paste the demo key `bwp_demo_kalvenor_sample`, leave Account blank, pick a data set, then Connect. Kalvenor is fictional sample data.
5. Check each data set: History (all three scopes), Run summary (Latest run, and a named run with the adaptive box ticked), Named instead, Sources, Alerts. Check a wrong key is refused and a wrong account gives the "No account or run with that id" message.
6. Build a report template from the sample (a scorecard with count, rate, base and interval; a History time series by engine; a Named instead table) and turn on link sharing. Its report id goes into `dataStudio.templates.default` before the Partner submission.

## 4. Production deployment

The Partner review looks for a deployment named exactly **Production**.

- **Editor:** Deploy > New deployment. Under Select type choose **Add-on** (Google's connector pages say only "create a versioned deployment" and do not name the type; Add-on is what connector publishers report using). Description: `Production`. Deploy, then copy the **Deployment ID**.
- **clasp (no type to choose):**
  ```sh
  clasp create-version "Production"
  clasp list-versions                  # note the new version number N
  clasp create-deployment --versionNumber N --description "Production"
  clasp list-deployments               # the Production line shows the deployment id
  ```
  Later releases: `clasp create-version`, then `clasp update-deployment <PRODUCTION_ID> --versionNumber N --description "Production"`, so the id and the name stay the same.

The link to share is `https://lookerstudio.google.com/datasources/create?connectorId=<PRODUCTION_DEPLOYMENT_ID>`. It can be published on app.broadcastwell.com/developers as the "Add to Looker Studio" link: that is an unlisted connector and needs no Google review.

## 5. Partner Connector gallery checklist

From developers.google.com/looker-studio/connector/pscc-requirements.

| Requirement | State |
| --- | --- |
| Share the script (view) with `data-studio-contrib-qa@googlegroups.com` and `data-studio-contrib@google.com` | Owner step, after step 2 |
| Deployment named `Production` | Owner step 4 |
| Manifest visible in the editor | Owner step 2 |
| Explicit `oauthScopes` in the manifest | Done: only `https://www.googleapis.com/auth/script.external_request`. DataStudioApp, PropertiesService, CacheService and Utilities need no scope. |
| `urlFetchWhitelist` lists every fetched address | Done: `https://app.broadcastwell.com/api/v1/` |
| `getAuthType()` auth, not a key field in getConfig | Done: KEY auth, checked against `GET /me` |
| `name` without the word connector, no special characters | Done: `Broadcastwell` |
| `shortDescription` of 114 characters or fewer, no URL | Done: 103 characters |
| Detailed `description` | Done |
| `logoUrl`: static, at least 48 by 48, on our own domain | Set to `https://app.broadcastwell.com/assets/connector-icon-256.png`. **Check it serves a 256 by 256 PNG before submitting.** |
| `addonUrl`: dedicated page on our domain with privacy policy, terms, usage details and signup link | Set to `https://app.broadcastwell.com/developers`. **That page needs a Looker Studio section with those four things.** |
| `supportUrl`: a hosted page, not mailto | Set to `https://app.broadcastwell.com/developers` |
| `privacyPolicyUrl`, `termsOfServiceUrl` | Set to `https://broadcastwell.com/privacy` and `https://broadcastwell.com/terms`. **Check both are live.** |
| `authType`, `feeType` | `["KEY"]`, `["PAID"]`. **Owner to confirm feeType**: PAID means the data needs a paid account; the demo key is free. `FREE_TRIAL` is the other candidate. |
| `sources` from the Looker Studio Data Registry | Set to `["BROADCASTWELL"]`, which **does not exist yet**. Open a pull request to github.com/googledatastudio/ds-data-registry adding it first. |
| Report template with link sharing, in `templates.default` | Owner step 3.6, then add `"templates": {"default": "<reportId>"}` and rebuild |
| Complete Google OAuth client verification, all scopes on the consent screen, then test with a new account that no "unverified app" screen appears | Owner step: in the Google Cloud project behind the script (switch the script to a standard Cloud project under Project Settings), fill the OAuth consent screen (app name Broadcastwell, support email, app domain broadcastwell.com, privacy and terms links, authorised domain broadcastwell.com, the one scope) and submit for verification. Domain ownership is proved in Search Console. |
| Complete, non beta, actionable errors, no spelling errors | Done in code; review once more on the real report |
| Submit | The "Publish your Partner Connector" form linked from the pscc-requirements page. Google publishes no review time. |

To unpublish later: email `data-studio-developer-feedback@google.com`.

## What is not ready, and why

- **No Apps Script project, deployment or submission.** They need the owner's Google sign in, which this build did not do.
- **`sources: ["BROADCASTWELL"]`** is not in the Data Registry yet. Until the registry pull request is merged, remove the line or expect the review to ask for it.
- **OAuth verification** needs a Google Cloud project, domain proof and Google's review. It is required even though the connector uses its own API key.
- **Report template** has to be made in Looker Studio by the owner.
- **addonUrl page content**: app.broadcastwell.com/developers must carry the Looker Studio usage details, privacy, terms and a signup link. Not checked by this build.
- **Logo, privacy and terms URLs** were not fetched by this build. Check they answer 200.
- **feeType** is an owner decision.
- **Tested in Node, not in Apps Script.** The tests run the exact built file in a Node vm with stand ins for the Apps Script services. The first run in Apps Script (step 3) is the real check of the builder calls against DataStudioApp.
- **No date range filtering at the API.** Looker Studio filters `observed_on` itself; the API has no date parameters for these routes.
