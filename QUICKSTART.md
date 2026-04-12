# Quick Start Guide

## Local Development Setup

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Set Up PostgreSQL Database

**Option A: Using Docker Compose (Recommended)**

The easiest way to set up a local PostgreSQL 17 database is using Docker Compose:

```bash
# Start PostgreSQL 17 in Docker
npm run db:up

# This will start PostgreSQL on localhost:5432 with:
# - Username: postgres
# - Password: postgres
# - Database: adhd_email_client
```

**Useful database commands:**

```bash
# Start database
npm run db:up

# Stop database
npm run db:down

# View database logs
npm run db:logs

# Reset database (removes all data)
npm run db:reset

# Connect to database with psql
npm run db:psql
```

**After starting the database, run migrations:**

```bash
cd server
npm run migration:run
```

**Option B: Local PostgreSQL Installation**

If you prefer to use a local PostgreSQL installation:

```bash
# Create database
createdb adhd_email_client

# Or using psql
psql -U postgres
CREATE DATABASE adhd_email_client;
```

**After creating the database, run migrations:**

```bash
cd server
npm run migration:run
```

### 3. Configure Environment Variables

**Backend** - Create `server/.env` file with the following configuration:

```bash
cd server
```

Create a `.env` file with these settings (for Docker Compose setup):

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration (Local Development with Docker)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=adhd_email_client
DB_SSL=false

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback

# Frontend URL
FRONTEND_URL=http://localhost:3000

# LLM Configuration
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-pro
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
OPENAI_REASONING_EFFORT=low

# Encryption Key (REQUIRED)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-secure-encryption-key-here

# Privacy & Terms Version
TERMS_VERSION=1.0.0
PRIVACY_VERSION=1.0.0

# Zoho Cliq Integration (optional - for waitlist notifications)
# If not provided, waitlist notifications will be skipped
ZOHO_CLIQ_BACKEND_BOT_WEBHOOK=your-cliq-webhook-url
ZOHO_CLIQ_API_KEY=your-cliq-api-key
ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL=your-cliq-channel-name
```

**Note:** Make sure to generate a secure `ENCRYPTION_KEY` and update other API keys as needed.

**Frontend** - Copy `client/.env.example` to `client/.env`:

```bash
cd client
cp .env.example .env
```

### 4. Start Development Servers

From the root directory:

```bash
npm run dev
```

Or separately:

```bash
# Terminal 1 - Backend
cd server
npm run start:dev

# Terminal 2 - Frontend
cd client
npm start
```

### 5. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/health

## First Steps

1. **Register an Account**: Navigate to http://localhost:3000 and create an account
2. **Explore Settings**: Go to Settings to configure email batching and view priority rules
3. **Test Features**:
   - Create a test email (via API or import)
   - Try snoozing an email with natural language (e.g., "2h", "wed")
   - Generate a summary
   - Add private notes

## Testing the API

You can test the API using curl or Postman:

```bash
# Register
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Get inbox (use token from login response)
curl -X GET http://localhost:3001/emails/inbox \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Common Issues

### Database Connection Error

- **If using Docker Compose:**
  - Ensure Docker is running: `docker ps`
  - Start the database: `npm run db:up`
  - Check database logs: `npm run db:logs`
  - Verify container is healthy: `docker-compose ps`
- **If using local PostgreSQL:**
  - Ensure PostgreSQL is running: `pg_isready` or `brew services list` (on macOS)
  - Check database credentials in `server/.env`
  - Verify database exists: `psql -l | grep adhd_email_client`

### Port Already in Use

- Change `PORT` in `server/.env` or `server/src/main.ts`
- Kill process using port: `lsof -ti:3001 | xargs kill`

### CORS Errors

- Ensure `FRONTEND_URL` in `server/.env` matches your frontend URL
- Check that frontend `.env` has correct `REACT_APP_API_URL`

## Next Steps

- Set up Google Calendar API credentials for meeting scheduling
- Configure email provider integration (IMAP/SMTP or API)
- Customize priority rules based on your needs
- Analyze your email history to build context
