# Claude Code Action — GitHub App authentication (BearlyMail)

> Use a **GitHub App installation token** instead of a PAT for `claude.yml`. Installation tokens are short-lived (~1 hour per job), revocable per-repo, and **are not** the workflow `GITHUB_TOKEN`, so PRs opened by Claude can still trigger `pull_request` workflows (e.g. `ci.yml`).

This mirrors how OpenClaw authenticates (App ID + installation + PEM), but in **GitHub Actions** we mint the token with [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token) and pass it to [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action) via the `github_token` input.

---

## Table of contents

1. [Can Claude use a GitHub App?](#can-claude-use-a-github-app)
2. [Reuse OpenClaw’s app vs a dedicated app](#reuse-openclaws-app-vs-a-dedicated-app)
3. [GitHub App permissions (org admin)](#github-app-permissions-org-admin)
4. [Where to put credentials in GitHub](#where-to-put-credentials-in-github)
5. [How the workflow uses them](#how-the-workflow-uses-them)
6. [Enabling and disabling](#enabling-and-disabling)
7. [Troubleshooting](#troubleshooting)
8. [Quick reference](#quick-reference)

---

## Can Claude use a GitHub App?

**Yes.** The Claude Code Action accepts an optional `github_token`. If you pass an **installation access token** from your GitHub App, `git` and `gh` run as that app’s bot user. That avoids long-lived PATs.

**Important distinction**

| Token | Typical effect on other workflows |
|--------|-----------------------------------|
| Default `GITHUB_TOKEN` from the same workflow | Does **not** trigger new workflow runs when it opens/updates a PR (GitHub guardrail). |
| **GitHub App installation token** (your app) | Behaves like a normal integration token; **`pull_request` workflows generally do run** for PRs created/updated with it. |

So: App token + `github_token` on the action ≈ “PAT approach” for CI visibility, without storing a PAT.

---

## Reuse OpenClaw’s app vs a dedicated app

| Approach | Pros | Cons |
|----------|------|------|
| **Same app as OpenClaw** | One registration, one private key rotation story | Must install that app on **this** repo; permissions are shared across all uses of the app |
| **Dedicated “BearlyMail Claude” app** | Least privilege for repo automation only | Another app to maintain |

Either works if the app is **installed** on `Focus-Bear/BearlyMail` (or your fork) with the permissions below.

---

## GitHub App permissions (org admin)

In **GitHub → Settings → Developer settings → GitHub Apps → (your app) → Permissions & events**, set **Repository permissions** to at least:

| Permission | Access | Why |
|------------|--------|-----|
| **Metadata** | Read-only | Default; required |
| **Contents** | Read and write | Branches, commits, pushes |
| **Issues** | Read and write | `@claude` on issues, comments |
| **Pull requests** | Read and write | Open/update PRs, reviews |
| **Actions** | Read (optional) | Matches `additional_permissions: actions: read` if Claude should inspect workflow runs |

**Subscribe to events** only if you use webhooks for the app outside Actions (not required for this token-only flow).

After changing permissions, GitHub may require **accepting the updated permissions** on the app installation (org or repo settings → Installed GitHub Apps).

The workflow also requests a **narrower token** via `permission-*` inputs where supported; the installation must still allow those permissions or token creation fails.

---

## Where to put credentials in GitHub

Configure at **repository** scope unless your org standardizes org-level secrets/variables.

**Settings → Secrets and variables → Actions**

### Repository variables (not secret)

| Name | Value |
|------|--------|
| `CLAUDE_GITHUB_APP_CLIENT_ID` | **Client ID** from the app’s “About” section (string, often starts with `Iv1.`). This is **not** the numeric “App ID” in URLs—use **Client ID** as required by [`actions/create-github-app-token` v3](https://github.com/actions/create-github-app-token). |

You can use the same pattern as OpenClaw docs conceptually; only the **Client ID** name matches what GitHub shows in the App UI today.

### Repository secrets

| Name | Value |
|------|--------|
| `CLAUDE_GITHUB_APP_PRIVATE_KEY` | Full **private key** (`.pem`) contents. Paste the PEM including `BEGIN` / `END` lines. If you store it with literal `\n` instead of newlines, the action will still normalize them. |

**Do not** commit the `.pem` or put it in variables (variables are readable by users with appropriate repo access).

### Optional org-level placement

If you prefer **organization** secrets and variables:

- Org **Variables**: e.g. `CLAUDE_GITHUB_APP_CLIENT_ID`
- Org **Secrets**: e.g. `CLAUDE_GITHUB_APP_PRIVATE_KEY`

Then either reference them the same way (if the workflow runs only on repos where org vars/secrets are allowed) or use **environments** with stricter protection rules.

---

## How the workflow uses them

In `.github/workflows/claude.yml`:

1. **If** `vars.CLAUDE_GITHUB_APP_CLIENT_ID` is non-empty, a step runs `actions/create-github-app-token@v3` with:
   - `client-id` ← variable  
   - `private-key` ← secret  
   - Repository scoped to the current repo  
   - Explicit `permission-contents`, `permission-issues`, `permission-pull-requests`, `permission-actions` where applicable  

2. **Checkout** uses `token: ${{ steps.<id>.outputs.token || github.token }}` so `git push` uses the app token when configured.

3. **Claude Code Action** gets `github_token: ${{ steps.<id>.outputs.token || github.token }}` so `gh` and API calls align with the same token.

If the Client ID variable is **empty**, those steps are skipped and the workflow falls back to the default `GITHUB_TOKEN` behaviour (same as before you configured the app).

---

## Enabling and disabling

| Goal | What to do |
|------|------------|
| **Enable** | Set variable `CLAUDE_GITHUB_APP_CLIENT_ID` and secret `CLAUDE_GITHUB_APP_PRIVATE_KEY`; ensure the app is installed on this repo with permissions above. |
| **Disable** | Clear/remove `CLAUDE_GITHUB_APP_CLIENT_ID` (or delete the variable). Secret can stay; it will not be used while the variable is unset. |

---

## Troubleshooting

### Token step fails: “Could not create access token” / 401 / 403

- Confirm the app is **installed** on the org/user that owns the repository.  
- Confirm **Client ID** matches the app (not the numeric App ID).  
- Confirm the private key belongs to **this** app (regenerate if unsure).  
- After permission changes, **re-approve** the installation.

### PR still does not trigger `ci.yml`

- Confirm the PR is created/updated using the **app token** (variable set, token step not skipped).  
- Check **branch protection** / required checks names still match what `ci.yml` emits.  
- Fork PRs from outside contributors have different rules; this doc targets in-repo `claude/*` flows.

### `git push` fails as the wrong user

- Ensure **checkout** runs **after** minting the token and uses the same token as `github_token` on the Claude action (the workflow is ordered that way on purpose).

### OpenClaw local scripts vs Actions

OpenClaw’s `github-app-token.js` + `source …-auth.sh` pattern is for **local/agent machines**. In CI, use **`actions/create-github-app-token`** instead; you do **not** upload `~/.openclaw/*.pem` into the repo—only the **GitHub Actions secret** above.

---

## Quick reference

| Item | Location |
|------|----------|
| Client ID variable | Repo (or org) **Actions variables** → `CLAUDE_GITHUB_APP_CLIENT_ID` |
| PEM secret | Repo (or org) **Actions secrets** → `CLAUDE_GITHUB_APP_PRIVATE_KEY` |
| Workflow | `.github/workflows/claude.yml` |
| Upstream token action | `actions/create-github-app-token@v3` |

### Install link (for org admins)

Create an install URL from the app’s **Public page** → “Install App”, or use GitHub’s install flow from the app settings. The app must have access to **BearlyMail** (this repository).

---

*For general CI behaviour and duplicate-run avoidance, see comments in `.github/workflows/ci.yml`.*
