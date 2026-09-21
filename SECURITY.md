# Security

Please report security problems privately to **hello@broadcastwell.com**. Do not open a public issue.

Include what you found, how to reproduce it and which package and version it affects. We will acknowledge your report, keep you informed while we fix it and credit you if you would like.

Scope: the code in this repository, including the API client, the n8n nodes and webhook signature verification. Problems with the Broadcastwell service itself go to the same address.

Good practice when using these connectors:

- Keep API keys and webhook signing secrets in your platform's secret store (for example n8n credentials), never in workflow parameters or source code.
- Verify every webhook with its signature before acting on it, over the raw request body, and reject timestamps more than 300 seconds from your clock.
- The public demo key reads only the fictional Kalvenor sample account and is safe to share.
