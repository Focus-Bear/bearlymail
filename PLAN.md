# PLAN: [PostHog][P1] Token validation failed: Invalid token — 597 occurrences in 24h

**Issue:** Focus-Bear/BearlyMail#715  
**Branch:** `plan/issue-715`

## Context

597 "Token validation failed: Invalid token" errors in 24 hours via PostHog. Unlike "Token has expired" (237 occurrences — expected/handled), "Invalid token" indicates tokens that are **malformed, from a wrong environment, or permanently revoked** — not just expired. A related error "Token validation failed: Error fetching user info" adds 88 more occurrences.

## Root Cause Investigation

**Most likely source:** `gmail.provider.ts` — the `validateToken()` method calls `oauth2Client.getAccessToken()` which can throw an error with message containing "Invalid token" (Google's OAuth2 library response) when:

1. The stored access/refresh token was issued in a different OAuth environment (dev tokens in production or vice versa)
2. The user revoked the app's Google OAuth permission from their Google Account settings
3. The token was encrypted with a different key (env migration or key rotation)
4. Office365/Zoho providers — their `handleTokenValidationError` throws `"Token validation failed - please log in again"` which PostHog may be capturing as `"Token validation failed: Invalid token"` from the underlying provider error

**File:** `server/src/emails/providers/gmail.provider.ts`

```typescript
private async validateToken(userId: string, user: User): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(/* ... */);
  oauth2Client.setCredentials({
    access_token: user.googleCalendarAccessToken,
    refresh_token: user.googleCalendarRefreshToken,
  });
  await oauth2Client.getAccessToken(); // ← Throws "Invalid token" from Google
}
```

When `getAccessToken()` fails with "Invalid token" (rather than the expected "Token expired" that triggers a refresh), the error propagates to `handleTokenValidationError` which re-throws `"Token refresh failed - please log in again"`. But the **original** Google error containing "Invalid token" is what PostHog captures before re-throw.

## Fix

### 1. Distinguish "invalid token" (irrecoverable) from "expired token" (recoverable) in `validateToken`

**File:** `server/src/emails/providers/gmail.provider.ts`

```typescript
private async validateToken(userId: string, user: User): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  oauth2Client.setCredentials({
    access_token: user.googleCalendarAccessToken,
    refresh_token: user.googleCalendarRefreshToken,
  });
  try {
    await oauth2Client.getAccessToken();
  } catch (error) {
    const errorMessage = (error as Error)?.message?.toLowerCase() || '';
    if (errorMessage.includes('invalid_token') || errorMessage.includes('invalid token')) {
      // Irrecoverable — token is malformed or revoked, not just expired
      // Mark user as needing re-login immediately (don't try grace period)
      await this.usersService.update(userId, { needsRelogin: true });
      throw new InvalidTokenError('Google access token is invalid or revoked. User must re-authenticate.');
    }
    // For other errors (expired, network), let the existing handler deal with it
    throw error;
  }
}
```

Create a new `InvalidTokenError` class so callers can distinguish it:

```typescript
// server/src/utils/errors.ts
export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}
```

### 2. Handle `InvalidTokenError` at the `syncEmails` call site

**File:** `server/src/emails/providers/gmail.provider.ts`

```typescript
try {
  await this.validateToken(userId, user);
} catch (error) {
  if (error instanceof InvalidTokenError) {
    // Don't attempt sync — send re-auth email and return early
    await this.notifyUserToReauthenticate(userId, user.email);
    return; // Don't throw — this is expected, not a bug
  }
  await this.handleTokenValidationError(userId, user, error, isRecentLogin);
}
```

### 3. Investigate and fix environment token leakage

If dev tokens are being stored in production (wrong environment), this is a critical config issue:

- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are environment-specific
- Add a startup assertion that rejects any stored token that doesn't decode to the expected `aud` (audience) claim for the current environment
- Add logging for which environment issued the stored token (decode JWT and log `aud` claim without exposing the token itself)

### 4. Add graceful re-authentication notification

**File:** `server/src/emails/providers/gmail.provider.ts` (new private method)

```typescript
private async notifyUserToReauthenticate(userId: string, email: string | null): Promise<void> {
  this.logger.warn(`User ${userId} has an invalid Gmail token — sending re-auth notification`);
  // Update needsRelogin flag (already done in validateToken above)
  // Optionally: trigger an email/notification telling user to reconnect Gmail
  // Don't throw — this is a user-facing auth state, not a bug
}
```

### 5. Address Office365/Zoho `handleTokenValidationError` error message format

Check whether PostHog is capturing the Office365/Zoho errors under this same bucket:

**File:** `server/src/emails/providers/office365.provider.ts` and `zoho.provider.ts`

The current error thrown is `"Token validation failed - please log in again"`. If PostHog is also capturing the underlying Microsoft/Zoho error message appended to this, it may produce `"Token validation failed: Invalid token"`. 

Normalize the error format:

```typescript
// Instead of:
throw new Error("Token validation failed - please log in again");

// Use:
throw new TokenValidationError('Token validation failed', { 
  reason: 'invalid_token', 
  provider: 'office365' 
});
```

## Files to Modify

| File | Change |
|------|--------|
| `server/src/emails/providers/gmail.provider.ts` | Distinguish `invalid_token` from expired token in `validateToken`; early return on irrecoverable token |
| `server/src/emails/providers/office365.provider.ts` | Normalize error format |
| `server/src/emails/providers/zoho.provider.ts` | Normalize error format |
| `server/src/utils/errors.ts` | Add `InvalidTokenError` class (create file if needed) |

## Acceptance Criteria

- [ ] `"Token validation failed: Invalid token"` PostHog errors drop to near-zero within 24h of deploy
- [ ] Users with invalid tokens get `needsRelogin: true` set immediately (no retry loop)
- [ ] Error is not captured as an unhandled exception in PostHog (expected auth state, not a bug)
- [ ] Environment token leakage hypothesis confirmed or ruled out via logging

## Risk / Notes

- Distinguish from "Token has expired" (237 occurrences) which IS expected and handled — don't accidentally suppress those
- The `needsRelogin` flag triggers the re-authentication flow on next user login — verify this flow works end-to-end before deploying
