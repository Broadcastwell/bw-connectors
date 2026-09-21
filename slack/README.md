# Broadcastwell for Slack

Ask Slack how the AI engines answer your buyers.

```
/broadcastwell status
```

> Your Company was named in 13 of 50 answers, 26.0% (95% interval 15.9 to 39.6), in the scheduled run observed on 2026-08-12. Headline figures count scheduled runs only.

| Command | What it does |
|-|-|
| `/broadcastwell sample` | The latest scheduled run of the fictional Kalvenor Systems sample. No account needed. |
| `/broadcastwell connect` | Sends you a one time link. You sign in to Broadcastwell and choose Allow; the workspace is then linked to that account, read only. |
| `/broadcastwell status` | The linked account's latest scheduled run: the count of answers that named you, the base, the rate and its 95% interval, with a link to the history. |
| `/broadcastwell disconnect` | Removes the link. Only the person who made it can do this from Slack; the account owner can always disconnect it under Connected apps in the Broadcastwell account. |

Answers are visible only to the person who typed the command.

Movement alerts are a separate feature: add a Slack incoming webhook address under Webhooks in your Broadcastwell account and choose which events to receive.

## What the app can do in your workspace

It asks for one scope, `commands`, so it can receive `/broadcastwell`. It cannot read messages, channels, files or members, and it posts nothing on its own. When the app is uninstalled, Slack tells Broadcastwell, and the workspace record, its stored token and its link to your account are deleted. Every request from Slack is checked against Slack's signing secret. The token Slack issues at install is stored encrypted.

## Install

Until the listing is live in the Slack Marketplace, install from https://app.broadcastwell.com/slack/install and choose Allow.

## For the Broadcastwell owner: creating the app (one time)

The command handler runs on app.broadcastwell.com. The Slack app itself is created in Slack by the owner, because it comes with three credentials:

1. Go to https://api.slack.com/apps, choose Create New App, then From a manifest, pick the workspace, and paste `manifest.json` from this folder.
2. Under Basic Information, copy the Signing Secret, the Client ID and the Client Secret.
3. Store them on the Pages project, from the platform repository folder (each command prompts for the value, so nothing lands in shell history):

   ```
   npx wrangler pages secret put SLACK_SIGNING_SECRET --project-name bw-client-data
   npx wrangler pages secret put SLACK_CLIENT_ID --project-name bw-client-data
   npx wrangler pages secret put SLACK_CLIENT_SECRET --project-name bw-client-data
   ```

4. Redeploy production (any push to main, or Retry deployment on the latest production deployment in the Cloudflare dashboard) so the secrets are bound.
5. Under Manage Distribution, complete the checklist and choose Activate Public Distribution.
6. In Slack, type `/broadcastwell sample`.

Until step 3 is done, the command address answers 503 with `slack_not_configured`.

## Slack Marketplace checklist (as read on 21 September 2026)

- The app must already be installed on 10 or more active workspaces before it can be submitted.
- Landing page, privacy policy (https://broadcastwell.com/privacy), support page (https://app.broadcastwell.com/developers or hello@broadcastwell.com); support must answer within two business days.
- Scopes justified: `commands` only, to receive the slash command.
- A video of install through uninstall, and reviewer access to a Broadcastwell account (the reviewers link their test workspace with `/broadcastwell connect`).
- Screenshots at 1600 by 1000.
- Icon: 512 by 512 minimum; use https://app.broadcastwell.com/assets/connector-icon-1024.png.
- The functional review of a new app can take up to ten weeks.

## Licence

MIT
