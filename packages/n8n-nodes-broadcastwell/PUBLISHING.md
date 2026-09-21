# Publishing n8n-nodes-broadcastwell

There are two ways to put this package on npm. Use the first one.

## Recommended: GitHub Actions with provenance

Since 1 May 2026, n8n only verifies community nodes that were published from a GitHub Actions workflow with an npm provenance statement. A package published from a laptop can still be installed on self hosted n8n, but it will not pass verification and will not appear for n8n Cloud users.

The workflow is [`.github/workflows/publish-n8n-node.yml`](../../.github/workflows/publish-n8n-node.yml) at the repository root. It runs on a tag named `n8n-nodes-broadcastwell@<version>`, installs, lints, builds, tests and publishes this folder with `--provenance`.

One time setup, by the owner:

1. Make the GitHub repository `Broadcastwell/bw-connectors` public. Provenance and the n8n scan both read the source from GitHub.
2. Give the workflow permission to publish. Either:
   - **Trusted publishing, no secret** (preferred once the package exists on npm): on npmjs.com open the package, **Settings**, **Trusted Publisher**, choose **GitHub Actions** and enter owner `Broadcastwell`, repository `bw-connectors`, workflow `publish-n8n-node.yml`. npm only offers this for a package that already exists, so use the token below for the very first release.
   - **Token**: on npmjs.com create a **Granular Access Token** with read and write access to `n8n-nodes-broadcastwell` (for the first release, to all packages, since the package does not exist yet). In GitHub open **Settings**, **Secrets and variables**, **Actions**, **New repository secret**, name it `NPM_TOKEN` and paste the token.

Each release:

```sh
# bump "version" in packages/n8n-nodes-broadcastwell/package.json, commit, then:
git tag n8n-nodes-broadcastwell@0.1.0
git push origin main --tags
```

The workflow fails if the tag does not match the version in `package.json`.

After the first release, submit the package for verification in the [n8n Creator Portal](https://creators.n8n.io/nodes). Before submitting, run n8n's scanner against the published version:

```sh
npx @n8n/scan-community-package n8n-nodes-broadcastwell
```

## Manual: one command

For a quick first publish without verification. After `npm login`, from this folder:

```sh
npm publish --access public
```

`prepack` builds `dist` first. This release has no provenance, so n8n will not verify it; publish the next version through the workflow above.
