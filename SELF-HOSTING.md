# Self-Hosting BearlyMail

BearlyMail can run entirely on your own hardware with Docker. This guide covers a
single-host deployment (Postgres + API + worker + web client) via Docker Compose.

> **License note:** BearlyMail is source-available under the
> [PolyForm Noncommercial License](./LICENSE). You may self-host it for personal
> and other non-commercial use for free. Commercial use requires a paid license —
> contact support@focusbear.io.

## What you need

- Docker + Docker Compose v2 (`docker compose version`)
- A **Google Cloud OAuth client** to connect Gmail accounts (free) — and/or
  Microsoft/Zoho OAuth apps for those providers
- An **LLM API key** — OpenAI, Google Gemini, or AWS Bedrock — for prioritisation,
  summaries, and replies (the app still runs without one, at reduced quality)

## Quick start (local)

```bash
git clone https://github.com/Focus-Bear/bearlymail.git
cd bearlymail

cp .env.selfhost.example .env
# edit .env — at minimum set DB_PASSWORD, ENCRYPTION_KEY, JWT_SECRET,
# an LLM key, and Google OAuth credentials

docker compose -f docker-compose.selfhost.yml up -d --build
```

Then open **http://localhost:8080**. The API is on http://localhost:3001, the
worker runs in the background, and database migrations run automatically before
the server starts.

Generate the two secrets with:

```bash
openssl rand -hex 32   # ENCRYPTION_KEY  (⚠ back this up — see below)
openssl rand -hex 32   # JWT_SECRET
```

> ⚠️ **Never change `ENCRYPTION_KEY` after emails are stored.** All email data is
> encrypted at rest with it; changing it makes existing data unrecoverable. Store
> a copy somewhere safe (a password manager).

## Connecting Gmail (Google OAuth)

1. In the [Google Cloud Console](https://console.cloud.google.com/) create a
   project and an **OAuth 2.0 Client ID** (type: Web application).
2. Add an **Authorized redirect URI** matching your deployment:
   - local: `http://localhost:3001/auth/google/callback`
   - production: `https://api.your-domain.com/auth/google/callback`
3. Enable the **Gmail API** (and **Google Calendar API** if you want meeting
   scheduling) for the project.
4. Put the client ID/secret and redirect URI into `.env`
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`).

Office365 (`MICROSOFT_CLIENT_ID` / `_SECRET`) and Zoho (`ZOHO_CLIENT_ID` /
`_SECRET`) work the same way — register an app with each provider and add the
credentials.

## Running in production (HTTPS + a real domain)

The client stores its auth token in an HttpOnly cookie and sends it with
credentials, so **the browser must reach the client and API over HTTPS**, ideally
on the same parent domain. The recommended layout:

- Serve the **client** at `https://mail.your-domain.com`
- Serve the **API** at `https://api.mail.your-domain.com`

When `VITE_API_URL` is left unset, the client automatically targets
`https://api.<its-own-hostname>`, so with the layout above you don't need to set
it at all. Put a reverse proxy (Caddy, nginx, Traefik) in front to terminate TLS
and route those two hostnames to the `client` (port 80) and `server` (port 3001)
containers. Set `FRONTEND_URL=https://mail.your-domain.com` in `.env` for CORS.

## Operations

- **Logs:** `docker compose -f docker-compose.selfhost.yml logs -f server worker`
- **Update:** `git pull && docker compose -f docker-compose.selfhost.yml up -d --build`
  (migrations re-run automatically)
- **Backups:** back up the `postgres_data` volume **and** your `ENCRYPTION_KEY`.
  A database backup is useless without the key.
  ```bash
  docker compose -f docker-compose.selfhost.yml exec postgres \
    pg_dump -U postgres adhd_email_client > backup-$(date +%F).sql
  ```
- **Stop:** `docker compose -f docker-compose.selfhost.yml down`
  (add `-v` to also delete the database volume — destructive).

## Notes on AWS

The production BearlyMail deployment runs on AWS (ECS Fargate, RDS, CloudFront)
via AWS CDK. That infrastructure is **not** part of this repository — it's
specific to Focus Bear's account and isn't needed for self-hosting. This Docker
Compose stack is the supported self-host path. Encryption also supports an
optional AWS KMS-backed key (`KMS_KEY_ID` + `ENCRYPTION_KEY_KMS_BLOB`); leave
those unset to use the static `ENCRYPTION_KEY`.
