# ADHD-Friendly Email Client (V1.1)

A non-distracting, highly efficient email client designed specifically for users with ADHD. This application implements intelligent prioritization, automated reply drafting, email batching, and contextual learning to minimize cognitive load and maximize productivity.

## Features

### Core Functionality

- **Intelligent Email Prioritization (FR 1)**: LLM-powered dynamic priority scoring (0-100) based on sender, sentiment, job title, and user behavior patterns with automatic urgency detection
- **Rule-Based Email Summarization (FR 2)**: LLM-powered customizable summarization rules (bullet points, action items, TL;DR, custom prompts)
- **Focused Email Delivery (FR 3)**: Batch non-urgent emails for configurable periods (default: 6 hours)
- **Quick Snooze (FR 4)**: Natural language snooze parsing (e.g., "2h", "3d", "wed")
- **Private Notes (FR 5)**: Add unshared notes to email threads
- **Contextual User Model (FR 6)**: Learn writing style, common phrases, and context from email history
- **Automated Reply Drafting (FR 7)**: LLM-powered reply generation based on learned context with rule generation
- **Calendar Integration (FR 8)**: Google Calendar API integration with LLM-powered meeting scheduling replies

### LLM Integration

- **Multi-Provider Support**: Switch between Google Gemini (default) and OpenAI GPT models
- **Intelligent Features**: All AI-powered features (summarization, replies, prioritization) use LLM for better quality
- **Automatic Fallback**: Falls back to rule-based systems if LLM is unavailable
- **Provider Selection**: Choose provider per-request or use default

## Technology Stack

- **Frontend**: React 19 with TypeScript
- **Backend**: NestJS (Node.js) with TypeScript
- **Database**: PostgreSQL
- **External Services**: Google Calendar API
- **LLM Integration**: Google Gemini (default) and OpenAI with router support

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 12+
- Google Cloud Platform account (for Calendar API)
- Google AI API key (for Gemini) or OpenAI API key (for GPT)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd email-client
```

2. Install dependencies:

```bash
npm run install-all
```

3. Set up environment variables:

**Backend** (`server/.env`):

```env
PORT=3001
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=adhd_email_client
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
FRONTEND_URL=http://localhost:3000

# GitHub App OAuth (for GitHub integration)
GITHUB_APP_CLIENT_ID=your-github-app-client-id
GITHUB_APP_CLIENT_SECRET=your-github-app-client-secret
GITHUB_APP_REDIRECT_URI=http://localhost:3001/github/callback

# LLM Configuration
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-pro
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
OPENAI_REASONING_EFFORT=low

# Encryption Key (REQUIRED - Use a secure random 32+ character string)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-secure-encryption-key-here

# Privacy & Terms Version (for consent tracking)
TERMS_VERSION=1.0.0
PRIVACY_VERSION=1.0.0

# RevenueCat API Key (optional - for subscription management)
REVENUECAT_API_KEY=your-revenuecat-api-key

# Zoho Cliq Integration (optional - for waitlist notifications)
ZOHO_CLIQ_BACKEND_BOT_WEBHOOK=your-cliq-webhook-url
ZOHO_CLIQ_API_KEY=your-cliq-api-key
ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL=your-cliq-channel-name
```

**Frontend** (`client/.env`):

```env
REACT_APP_API_URL=http://localhost:3001

# PostHog Analytics (optional)
REACT_APP_POSTHOG_API_KEY=your-posthog-project-api-key
REACT_APP_POSTHOG_API_HOST=https://us.i.posthog.com

# RevenueCat (optional - for subscription management)
REACT_APP_REVENUECAT_API_KEY=your-revenuecat-public-api-key
```

4. Set up PostgreSQL database:

```bash
createdb adhd_email_client
```

5. Start the development servers:

```bash
npm run dev
```

This will start:

- Backend API on `http://localhost:3001`
- Frontend on `http://localhost:3000`

## Running fully locally on a Mac (Apple Mail + Claude Code)

BearlyMail can run entirely on your Mac with **no cloud email API and no LLM API keys**: email is pulled from the local Mail.app via AppleScript, and all LLM calls are routed through the [Claude Code](https://claude.com/claude-code) CLI (`claude -p`).

### Prerequisites

- macOS (the server must run on the same Mac as Mail.app) with Node.js 22+
- Mail.app with at least one account **enabled** (Mail → Settings → Accounts → tick "Enable this account") and its mailbox synced
- [Claude Code CLI](https://claude.com/claude-code) installed and logged in (`npm install -g @anthropic-ai/claude-code`, then run `claude` once to authenticate)

No Docker, no PostgreSQL install, and no API keys are needed.

### Setup — one command

```bash
npm run local
```

That's it. On first run this installs dependencies, boots an **embedded PostgreSQL 17** (downloaded automatically, data stored in `.localdata/`), runs migrations, seeds a login user, and starts the API server, background worker, and web client together. It prints your login credentials:

```
  App:       http://localhost:3000
  Login:     local@bearlymail.local
  Password:  <generated once, saved in .localdata/local.env>
```

Then in the app:

1. Log in with the printed credentials at `http://localhost:3000`.
2. Go to **Settings → Email accounts → Connect Another → Apple Mail** and click connect. This enumerates the accounts configured in Mail.app and mirrors their inboxes.
3. **Grant automation permission**: the first Apple Mail operation makes macOS show an "…wants to control Mail" prompt for the terminal that runs the server. Click **Allow** (manage later under System Settings → Privacy & Security → Automation).

Stop everything with `Ctrl+C` (the embedded database shuts down too). Useful extras:

- `npm run local -- --reset` — wipe the local database and secrets, start fresh
- `BEARLYMAIL_LOCAL_PG_PORT=<port> npm run local` — pin the Postgres port (default: first free port from 5433)
- Any env var you export beforehand overrides the defaults, e.g. `LLM_PROVIDER=openai OPENAI_API_KEY=... npm run local`, or `CLAUDE_CLI_MODEL=haiku npm run local`

<details>
<summary>Manual setup (your own PostgreSQL, per-variable control)</summary>

1. Install dependencies and start a PostgreSQL 17 (e.g. `npm run install-all && npm run db:up` with Docker), then run migrations: `cd server && npm run migration:run`.

2. Configure `server/.env`:

```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=adhd_email_client
JWT_SECRET=any-random-string
ENCRYPTION_KEY=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
FRONTEND_URL=http://localhost:3000

# Route ALL LLM calls through the local Claude Code CLI - no API keys needed
LLM_PROVIDER=claude-cli
# Optional overrides:
# CLAUDE_CLI_PATH=/usr/local/bin/claude   (default: "claude" on PATH)
# CLAUDE_CLI_MODEL=sonnet                 (default: sonnet)
```

The client needs no env (`VITE_API_URL` defaults to `http://localhost:3001`). Google/Microsoft/Zoho OAuth variables can be omitted entirely.

3. Seed a login user (registration is waitlist-gated): `cd server && LOCAL_USER_PASSWORD=<pick-one> npm run seed:local-user`.

4. Start the app with `npm run dev` (this does not start the background worker — run `node server/dist/worker.js` after a build for sync/LLM jobs), then log in and connect Apple Mail as above.

</details>

### What works and current limitations

| Capability | Status |
| --- | --- |
| Inbox sync (all enabled Mail.app accounts) | ✅ incremental, ~5 min cadence |
| Reply / compose (with attachments) | ✅ sent through Mail.app, reply threading preserved |
| Archive / trash / unarchive write-back | ✅ moves the message in Mail.app |
| Star write-back | ✅ maps to Mail's flagged status |
| Read-status sync (Mail → BearlyMail) | ✅ |
| Attachments (view/download) | ✅ fetched from Mail.app on demand |
| Snooze / batching / priorities / summaries | ✅ BearlyMail-local (no Mail.app equivalent) |
| HTML email bodies | ⚠️ plain-text only (AppleScript limitation) |
| Threading | ⚠️ derived from References headers; occasional splits possible |

Notes:

- Mail.app must be running (the integration launches it in the background automatically) and the Mac must be awake for syncs to happen.
- `LLM_PROVIDER=claude-cli` uses your Claude Code subscription for prioritisation, summaries, and reply drafting. If the CLI call fails and `OPENAI_API_KEY`/`GEMINI_API_KEY` are configured, the system falls back to them; with no keys configured it degrades to rule-based behaviour like any other LLM outage.

## Self-Hosting / Deployment

The supported way to run your own instance is Docker Compose:

```bash
cp .env.selfhost.example .env   # fill in secrets + OAuth + an LLM key
docker compose -f docker-compose.selfhost.yml up -d --build
# open http://localhost:8080
```

See **[SELF-HOSTING.md](SELF-HOSTING.md)** for the full guide (OAuth setup, HTTPS,
backups). The server just needs Node.js and PostgreSQL, so it also runs on any
platform that provides those.

## Project Structure

```
email-client/
├── server/                 # NestJS backend
│   ├── src/
│   │   ├── auth/          # Authentication module
│   │   ├── calendar/      # Google Calendar integration
│   │   ├── context/       # User context learning
│   │   ├── database/      # Database entities
│   │   ├── emails/        # Email management
│   │   ├── notes/         # Private notes
│   │   ├── priority/      # Prioritization logic
│   │   ├── replies/       # Reply generation
│   │   ├── snooze/        # Snooze functionality
│   │   ├── summarization/ # Email summarization
│   │   └── users/         # User management
│   ├── Dockerfile         # Docker configuration
│   └── package.json
├── client/                 # React frontend
│   ├── src/
│   │   ├── contexts/      # React contexts (Auth)
│   │   ├── pages/         # Page components
│   │   ├── theme/         # Color scheme and theme
│   │   └── App.tsx
│   └── package.json
└── README.md
```

## Color Scheme

The application uses a calming, ADHD-friendly color palette inspired by focusbear.io:

- **Primary**: Soft blue (#4A90E2)
- **Secondary**: Gentle green (#5CB85C)
- **Background**: Clean neutrals (#F8F9FA, #FFFFFF)
- **Text**: High contrast dark grays (#2C3E50)

## API Endpoints

### Authentication

- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user

### Emails

- `GET /emails/inbox` - Get inbox emails (prioritized)
- `GET /emails/:id` - Get email details
- `POST /emails` - Create email (for testing)
- `PUT /emails/:id/read` - Mark as read
- `PUT /emails/:id/archive` - Archive email
- `POST /emails/force-check` - Force check for new emails

### Priority

- `GET /priority/rules` - Get priority rules
- `POST /priority/rules` - Create priority rule
- `PUT /priority/rules/:id` - Update priority rule
- `DELETE /priority/rules/:id` - Delete priority rule

### Snooze

- `POST /snooze/:id` - Snooze email
- `DELETE /snooze/:id` - Unsnooze email

### Notes

- `GET /notes/thread/:threadId` - Get note for thread
- `POST /notes/thread/:threadId` - Create/update note

### Summarization

- `POST /summarize/:id` - Summarize email (supports `provider` in body: 'gemini' or 'openai')

### Replies

- `POST /replies/draft/:id` - Generate reply draft (supports `provider` in body: 'gemini' or 'openai')
- `POST /replies/learn` - Learn from modification
- `GET /replies/rules` - Get reply rules

### Calendar

- `GET /calendar/slots` - Get available time slots
- `POST /calendar/meeting-reply/:id` - Generate meeting reply (supports `provider` in body: 'gemini' or 'openai')

### LLM

- `GET /llm/providers` - Get available LLM providers and default

### Context

- `GET /context` - Get user context
- `POST /context/analyze` - Analyze emails for context
- `POST /context` - Create context entry

## Development

### Running Tests

```bash
cd server
npm test
```

### Building for Production

```bash
# Backend
cd server
npm run build

# Frontend
cd client
npm run build
```

## Security

- All passwords are hashed using bcrypt
- JWT tokens for authentication
- CORS configured for frontend
- Environment variables for sensitive data
- TLS 1.3 for data in transit (production)
- AES-256-GCM encryption at rest for all sensitive data (email content, OAuth tokens, user PII)
- See [docs/threat-model.md](docs/threat-model.md) for the formal STRIDE threat model

## License

BearlyMail is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

- **Personal and noncommercial use is free** — run it for yourself, study it, modify it, share it.
- **Commercial use requires a paid license from Focus Bear Pty Ltd.** Contact [support@focusbear.io](mailto:support@focusbear.io) to arrange one.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
