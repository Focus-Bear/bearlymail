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

```bash
# Create database
createdb adhd_email_client

# Or using psql
psql -U postgres
CREATE DATABASE adhd_email_client;
```

### 3. Configure Environment Variables

**Backend** - Copy `server/.env.example` to `server/.env` and update values:
```bash
cd server
cp .env.example .env
# Edit .env with your database credentials
```

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
- Ensure PostgreSQL is running
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

