# BearlyMail - ADHD-Friendly Email Client

## Overview

BearlyMail is a full-stack email management application designed for users with ADHD. It batches non-urgent emails and delivers them on a schedule, while allowing urgent emails to break through immediately.

## Architecture

- **Frontend**: React + TypeScript + Vite (port 5000)
- **Backend**: NestJS + TypeScript (port 3001)
- **Database**: PostgreSQL (Replit-hosted, helium host)
- **Queue**: pg-boss for background job processing
- **Auth**: JWT + Google OAuth / Microsoft OAuth / Zoho OAuth

## Project Structure

```
/
├── client/          # React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── store/       # Redux store
│   │   ├── hooks/
│   │   └── contexts/
│   └── vite.config.ts   # Vite config (port 5000, allowedHosts: true)
├── server/          # NestJS backend
│   ├── src/
│   │   ├── auth/
│   │   ├── emails/
│   │   ├── queue/       # pg-boss queue management
│   │   ├── database/    # TypeORM config + migrations
│   │   └── ...
│   ├── dist/        # Compiled output
│   └── .env         # DB config, JWT secret
└── e2e/             # Playwright end-to-end tests
```

## Workflows

- **Start application**: `cd client && npm run start` → port 5000 (webview)
- **Backend Server**: `cd server && node dist/main.js` → port 3001 (console)

## Setup Notes

### Database

The database uses Replit's built-in PostgreSQL (host: `helium`). SSL must be disabled explicitly since the host is not `localhost`.

Key env vars in `server/.env`:
- `DB_HOST=helium`
- `DB_SSL=false` (critical - Replit DB doesn't support SSL)
- `JWT_SECRET` - set to a secure value in production

All 58 migrations run via TypeORM. Fixed `1768200000000-AddPgBossJobIndexes.ts` to gracefully skip if pgboss schema doesn't exist yet.

### SSL Fix

Both `server/src/data-source.ts` and `server/src/queue/queue.module.ts` were updated to respect `DB_SSL=false` even when the host isn't `localhost`. The original code always tried SSL for non-localhost hosts.

### Node.js Version

Requires Node.js 20+ (Vite 7 requirement). Upgraded from Node 18 to Node 20.

### Building the Server

The server must be compiled before running:
```bash
cd server && node_modules/.bin/nest build
```

### OAuth Credentials

The app requires external OAuth providers to be configured in `server/.env`:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`
- `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`

### Optional Services

- `POSTHOG_API_KEY` - Analytics and error tracking
- `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` - Real-time push notifications
- AWS credentials - CloudWatch metrics

## Storybook

Storybook runs on port 6000 (`npm run storybook` in the `client/` directory).

Key configuration decisions:
- `reactDocgen: false` in `.storybook/main.ts` — required to stay within the 8GB cgroup memory limit. Enabling it causes OOM crashes during bundling.
- `preview.tsx` is kept minimal (no imports from the main app) for the same reason.
- All story files in `client/src/stories/` are **fully self-contained** — they do not import any component from the main app. They recreate the UI inline with hardcoded design tokens. This avoids pulling in heavy transitive dependencies (posthog-js, auth chain, etc.).
- Storybook v8.6.17 (`@storybook/react-vite`) with `@storybook/addon-essentials` only.

### Email Detail Design Tokens (hardcoded in stories)
- Summary section accent: `#D97706` / `#FFFBEB`
- Private Notes accent: `#7C3AED` / `#F5F3FF`
- Action Items accent: `#16A34A` / `#F0FDF4`
- GitHub Status accent: `#1F2937` / `#F9FAFB`
- Priority buttons: "😊 Can wait" (1), "😀 Get on it" (2), "🤯 Oh sh$t" (3)
