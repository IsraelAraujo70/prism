# AI PR review — setup

The `ai-pr-review.yml` workflow runs OpenAI Codex CLI against every PR using a ChatGPT subscription (no API key). This file documents the one-time setup required.

## 1. Generate the Codex auth file locally

On your dev machine, with the ChatGPT subscription you want to use:

```bash
npm install -g @openai/codex
codex login           # opens a browser — sign in with ChatGPT
cat ~/.codex/auth.json
```

Copy the **entire** contents of `~/.codex/auth.json`. Treat it like a password.

## 2. Add the repo secret

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

- Name: `CODEX_AUTH_JSON`
- Value: paste the JSON from step 1

## 3. How the workflow uses it

- On the first run (or after the auth cache is purged), the workflow seeds `~/.codex/auth.json` from this secret.
- Codex refreshes the file in place during use; the workflow caches it back so subsequent runs reuse the refreshed token.
- The cache key is `codex-auth-<repo>-<run_id>`, with restore-key `codex-auth-<repo>-` — every run saves a fresh copy and restores the most recent.

If the token ever expires beyond Codex's auto-refresh window, re-run `codex login` locally and update the secret.

## Notes

- **Forks:** PRs from forks do not have access to repo secrets, so the workflow will fail on community PRs. For an internal-only repo (current Prism setup) this is fine. If we later need fork support, switch to `pull_request_target` with explicit safeguards.
- **Spike status:** the current workflow only posts a smoke-test comment. Per-area rubrics, structured findings, and `REQUEST_CHANGES` blocking come in follow-up steps.
