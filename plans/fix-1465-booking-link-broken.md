# Plan: fix(#1465) — Calendar booking link broken

## Problem

Jeremy reports the calendar booking link (`/book/:userId`) is broken.
When logged in as the page owner, the page should show the actual server error but instead shows a generic "Calendar is temporarily unavailable" message.

## Root Cause Analysis

### Bug 1 (Primary): BookingPage never sends auth token to the API

`client/src/pages/BookingPage.tsx` uses plain `axios` (no Bearer token) for all API calls:

```ts
// line 71-72 — plain axios, no auth header
const response = await axios.get(
  `${API_URL}/public/calendar/${userId}/slots?...`,
);
```

The server endpoint (`GET /public/calendar/:userId/slots`) has `OptionalJwtAuthGuard`.
This guard checks for a Bearer token → none exists → `req.user` is `undefined`.

The error handler in `public-calendar.controller.ts` (line 94):

```ts
const isPageOwner = req.user
  ? await this.calendarService.isSameBookingHost(req.user.userId, userId)
  : false;
```

Since `req.user` is always `undefined`, `isPageOwner` is always `false`.
The owner always gets the sanitized message, never the real error.

### Bug 2 (Symptom): Client-side host check is neutered

`BookingPage.tsx` has a client-side fallback:

```ts
const isHostView = Boolean(userId && user?.id && user.id === userId);
const serverMessage = getAxiosResponseErrorMessage(error);
if (isHostView) {
  setError(serverMessage ?? t("booking.error.ownerFallback"));
}
```

Even when `isHostView` is `true`, `serverMessage` is `"Calendar is temporarily unavailable"` because the server already swallowed the real error. So the owner sees a slightly better UI but with the same unhelpful message.

### Possible cause of the actual calendar failure

`googleCalendarAccessToken` is stored encrypted via `encryptedColumnTransformer` (aes-256-gcm).

If `tryDecrypt` fails (wrong key, rotated key), it returns raw ciphertext silently (with a circuit-breaker after 3 consecutive failures). The raw ciphertext is then passed to Google's OAuth2 client as an access token → Google rejects it → caught as "expired" or "Failed to fetch calendar data" → generic error returned.

This would explain why the booking page is "broken" — the tokens may have been re-encrypted with a different key, or the encryption key environment variable is misconfigured in the deployment.

## Fix Plan

### File 1: `client/src/pages/BookingPage.tsx`

**Change:** When the user is authenticated, pass the JWT token in the Authorization header for the slots and booking API calls so the server can identify the page owner.

```ts
// In fetchSlots callback, use authenticated request when available
import { useAuth } from "contexts/AuthContext";
// Already imported — good.

// Before the axios.get call, construct headers:
const headers: Record<string, string> = {};
const token = localStorage.getItem("access_token"); // or wherever the JWT is stored
if (token) {
  headers["Authorization"] = `Bearer ${token}`;
}

const response = await axios.get(
  `${API_URL}/public/calendar/${userId}/slots?...`,
  { headers },
);
```

Same for the `POST /book` call in `handleBook`.

> **Implementation note:** Check `AuthContext` or the app's axios interceptor setup to find where the JWT is stored. The app likely has an authenticated axios instance somewhere — use it, or extract the token from the same source.

### File 2: `server/src/calendar/public-calendar.controller.ts`

**No changes needed** — the server-side logic is already correct. Once the client sends the JWT, `req.user` will be populated and `isPageOwner` will work.

### File 3: `client/src/components/booking/BookingErrorState.tsx`

**No changes needed** — already supports `showHostDiagnostic` and `hostDiagnosticText`.

### Verification

1. Check how the JWT is stored/accessed in the client (likely `localStorage` or via `AuthContext`).
2. Ensure the authenticated axios instance (if one exists) is used, or manually attach the token.
3. Test: as the booking host, visit `/book/<your-user-id>` while logged in. Should see the real error (e.g., "Google Calendar access has expired") instead of "Calendar is temporarily unavailable".
4. Test: as a guest (not logged in), same URL should still show the generic error.

### Additional investigation needed at implementation time

- Verify whether the underlying calendar failure is token expiry (needs Google reconnect) vs encryption key mismatch. If encryption, that's a separate ops issue.
- Check if there's an existing authenticated axios instance in the client that should be used instead of raw `axios`.

## Files to change

| File                               | Change                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| `client/src/pages/BookingPage.tsx` | Send JWT in Authorization header for slots + book API calls |

## Risk

- **Low** — only adds an optional auth header to public endpoints that already handle both authenticated and anonymous requests.
- No schema changes, no encryption changes, no new dependencies.

---

_Plan by Monk of Modularity 🧘 — AI-generated planning PR_
