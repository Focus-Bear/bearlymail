# Data Encryption

This application encrypts sensitive data at rest in the database using AES-256-GCM encryption.

## Encrypted Fields

The following sensitive data is encrypted:

- **Email addresses** (User, Waitlist) - Encrypted with SHA-256 hash for querying
- **Email bodies and HTML bodies** (Email entity)
- **Email subjects and sender information** (Email entity)
- **Refresh tokens** (User entity - Google Calendar refresh tokens)
- **Access tokens** (User entity - Google Calendar access tokens)
- **User contexts** (UserContext entity)
- **Priority rule conditions** (PriorityRule entity)
- **Summarization rules** (SummarizationRule entity)
- **Private notes** (PrivateNote entity)
- **Waitlist reasons and first names** (Waitlist entity)

## Email Querying

Email addresses are encrypted, but we need to query by them for login. To enable this:
- A SHA-256 hash of the email is stored in the `emailHash` column (not encrypted)
- Queries use the hash instead of the encrypted email
- The actual email is stored encrypted in the `email` column

## Environment Variables

You **must** set the `ENCRYPTION_KEY` environment variable in production. This key is used to encrypt/decrypt all sensitive data.

```bash
ENCRYPTION_KEY=your-secure-random-32-character-key-here
```

**⚠️ WARNING:** 
- If you lose this key, all encrypted data becomes unrecoverable
- Do not change this key after data is encrypted (data will become unreadable)
- Use a cryptographically secure random string (at least 32 characters)
- Store this key securely (use a secrets manager in production)

### Generating a Secure Key

```bash
# Generate a random 32-character key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Implementation Details

- Encryption is handled automatically via TypeORM column transformers
- Encryption/decryption happens transparently when reading/writing entities
- Uses AES-256-GCM encryption algorithm
- Each encrypted value includes IV (Initialization Vector) and auth tag for security

## Migration Notes

If you're migrating existing plaintext data:
1. Set `ENCRYPTION_KEY` in your environment
2. Restart the application - TypeORM will encrypt data on write
3. Existing plaintext data will be automatically encrypted when entities are saved
4. The decryption function will gracefully handle plaintext data (for backwards compatibility)

## Passwords

Passwords are **hashed** (not encrypted) using bcrypt. This is a one-way operation and passwords cannot be recovered.





