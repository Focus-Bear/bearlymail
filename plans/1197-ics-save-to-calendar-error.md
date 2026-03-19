# Plan: #1197 — Error when trying to save ICS invite to Google Calendar

**Branch:** `plan/1197-ics-save-to-calendar-error`
**Author:** monk-of-modularity[bot] (AI planning agent)

## Problem

Users get an error when trying to save an ICS calendar invite to Google Calendar from within BearlyMail.

## Investigation

### Server: `calendar.service.ts` — `addIcsEventToCalendar`

**Issue 1: Shared `oauth2Client` singleton (race condition + stale credentials)**

`CalendarService` has a single `this.oauth2Client` instance shared across all requests. When multiple users call calendar endpoints concurrently, `setCredentials()` calls on the singleton will overwrite each other — meaning user A's token could be replaced by user B's mid-request.

```ts
// singleton — BAD for multi-user concurrent access
this.oauth2Client.setCredentials({
  access_token: user.googleCalendarAccessToken,
  refresh_token: user.googleCalendarRefreshToken,
});
```

**Issue 2: No token refresh handling**

When the `access_token` has expired, the Google API will return a 401. The code catches this and rethrows as a generic `Error` (not a NestJS `HttpException`), so the controller wraps it in a 500 `InternalServerErrorException` with a non-descriptive message. The user sees a generic error.

The `oauth2Client` should auto-refresh if `refresh_token` is set, but only if `access_token` is set correctly. If the stored `access_token` is stale/null and no refresh happens, the call fails silently with a confusing error.

**Issue 3: `endAt` may equal `startAt` for all-day events**

```ts
end: eventData.allDay
  ? { date: (eventData.endAt ?? eventData.startAt).slice(0, 10) }
```

For all-day events, Google Calendar requires `end.date` to be the day AFTER the last day (exclusive). If `endAt === startAt`, a 1-day event is created as a zero-duration event, which Google rejects with a 400.

**Issue 4: Controller doesn't re-throw HttpException from `addIcsEventToCalendar`**

`addIcsEventToCalendar` throws a plain `Error`, not a `BadRequestException` or `HttpException`. The controller's `catch` block checks `instanceof HttpException` and re-throws those — but since `addIcsEventToCalendar` throws a plain `Error`, it falls through to the `InternalServerErrorException`. The user gets a 500 with no useful detail.

### Client: `IcsInviteCard.tsx`

The client correctly shows the `serverMessage` if the server returns one in `err.response?.data?.message`. But since the server returns 500 `InternalServerErrorException`, the message is generic.

## Proposed Fixes

### Fix 1: Per-request OAuth2 client (eliminate shared singleton race condition)

```ts
// Instead of this.oauth2Client.setCredentials(...)
// Create a fresh client per request:
const reqOauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);
reqOauth2.setCredentials({
  access_token: user.googleCalendarAccessToken,
  refresh_token: user.googleCalendarRefreshToken,
});
const calendar = google.calendar({ version: 'v3', auth: reqOauth2 });
```

This fixes the race condition. The existing singleton on `this.oauth2Client` can be kept for other purposes (e.g., the shared auth flow) but should not be mutated per-request.

### Fix 2: Better error handling with token refresh

Catch Google API errors, detect 401 (invalid_grant / token expired), and return a user-friendly `BadRequestException`:

```ts
} catch (err) {
  const status = (err as any)?.response?.status ?? (err as any)?.code;
  if (status === 401 || (err as any)?.message?.includes('invalid_grant')) {
    throw new BadRequestException('Google Calendar token expired. Please reconnect Google Calendar in settings.');
  }
  // ... existing generic handler
}
```

### Fix 3: Fix all-day event end date

```ts
end: eventData.allDay
  ? { date: addOneDay(eventData.endAt ?? eventData.startAt) }
  : { ... }

// Helper:
function addOneDay(isoDate: string): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
```

### Fix 4: Surface errors properly to the client

Convert the error in `addIcsEventToCalendar` to `BadRequestException` / `InternalServerErrorException` (NestJS types) so the controller's existing `HttpException` re-throw path works correctly.

## Files to Change

| File | Change |
|---|---|
| `server/src/calendar/calendar.service.ts` | Per-request OAuth2 client in `addIcsEventToCalendar`; fix all-day end date; better error classification |
| `server/src/calendar/calendar.service.ts` | Apply same per-request OAuth2 fix to `getIcsInfo` and other methods that mutate `this.oauth2Client` |
| `server/src/calendar/calendar.service.spec.ts` | Add tests for expired token path and all-day event end date |

## Testing

1. Save ICS invite with valid Google Calendar connection → success
2. Save ICS invite with expired access token (manually expire or mock) → user-friendly error message
3. Save all-day event ICS → event created with correct date range in Google Calendar
4. Concurrent requests from two different users → no credential cross-contamination
