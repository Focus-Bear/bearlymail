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

# LLM Configuration
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-pro
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-3.5-turbo
```

**Frontend** (`client/.env`):
```env
REACT_APP_API_URL=http://localhost:3001
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

## Deployment on Koyeb

### Prerequisites

1. A Koyeb account ([koyeb.com](https://www.koyeb.com))
2. A GitHub repository with your code
3. PostgreSQL database (Koyeb provides managed PostgreSQL or use external service)

### Deployment Steps

1. **Push to GitHub**:
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Deploy on Koyeb**:
   - Sign in to Koyeb dashboard
   - Click "Create Web Service"
   - Select GitHub as deployment source
   - Choose your repository
   - Configure the service:
     - **Builder**: Dockerfile
     - **Dockerfile Path**: `server/Dockerfile`
     - **Run Command**: `node dist/main.js`
     - **Port**: `3001`
   - Add environment variables (see `.env.example`)
   - Deploy

3. **Configure Database**:
   - Use Koyeb's managed PostgreSQL or external service
   - Update `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` in Koyeb environment variables

4. **Deploy Frontend** (separate service or static hosting):
   - Build the frontend: `cd client && npm run build`
   - Deploy the `build` folder to a static hosting service
   - Update `REACT_APP_API_URL` to point to your backend URL

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
│   ├── Dockerfile         # Docker configuration for Koyeb
│   └── package.json
├── client/                 # React frontend
│   ├── src/
│   │   ├── contexts/      # React contexts (Auth)
│   │   ├── pages/         # Page components
│   │   ├── theme/         # Color scheme and theme
│   │   └── App.tsx
│   └── package.json
├── koyeb.yaml             # Koyeb deployment config
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

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

