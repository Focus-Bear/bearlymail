# Plan: Add Meeting Purpose to Booking Page (#1478)

**Issue:** https://github.com/Focus-Bear/BearlyMail/issues/1478
**Author:** Monk of Modularity (AI agent) via OpenClaw
**Status:** Planning

---

## Root Cause

The backend `createEvent()` function already accepts optional `title` and `description` parameters. The `calendar_booking` entity already has both columns in the database. However, the public booking endpoint and the `BookingForm` UI component never collect or pass these fields. No database migration is needed — this is purely a wiring gap.

## Proposed Changes

### 1. Add agenda/purpose textarea to `BookingForm`

- Add a new textarea field labelled "What's the purpose of this meeting?" (or similar) to the `BookingForm` component.
- Field should be optional but encouraged (placeholder text suggesting what to write).
- Place it after the existing fields (name, email, date/time selection) and before the submit button.
- Character limit: ~500 characters with a visible counter.

**Files:** `BookingForm.tsx` (or equivalent booking form component).

### 2. Accept `agenda` in the public booking endpoint

- Update the public booking API endpoint to accept an `agenda` field in the request body.
- Validate: optional string, max 500 characters, sanitise for XSS.
- Pass `agenda` through to `createEvent()` as the `description` parameter.

**Files:** Booking controller/route handler (public endpoint).

### 3. Use `LLMCoreService` to summarise agenda → meeting title

- When `agenda` is provided, call `LLMCoreService` to generate a concise meeting title (≤60 chars) from the agenda text.
- **Graceful fallback:** If LLM call fails (timeout, rate limit, error), fall back to the first ~60 characters of the user-provided agenda text as the title.
- If no agenda is provided at all, retain current behaviour (default title).

**Files:** Booking service layer (where `createEvent()` is called), potentially a small utility function for the LLM summarisation call.

### 4. Put full agenda in event description

- Pass the full user-provided agenda text as the `description` field to `createEvent()`.
- This ensures the calendar event body contains the meeting purpose for both parties.

**Files:** Same booking service layer as step 3.

## Data Flow

```
BookingForm (UI)
  → POST /api/public/booking { ...existing fields, agenda: "..." }
    → Controller validates & sanitises
      → Service: LLMCoreService.summarise(agenda) → title (with fallback)
      → Service: createEvent({ title, description: agenda, ...rest })
        → calendar_booking row created (title + description populated)
        → Calendar event created with title + description
```

## Testing

- [ ] BookingForm renders textarea; form submits with and without agenda.
- [ ] API accepts `agenda`, rejects >500 chars, sanitises HTML/script tags.
- [ ] With agenda: event title is LLM-summarised, description contains full agenda.
- [ ] LLM failure fallback: title = truncated agenda text, description still populated.
- [ ] Without agenda: existing behaviour unchanged (regression check).
- [ ] Calendar event (Google/Outlook) shows title and description correctly.

## Risk Assessment

**Low risk.** No migration needed — uses existing columns. The LLM call has an explicit fallback path so booking never fails due to AI. The public endpoint change is additive (new optional field). Existing bookings without agenda continue to work identically.

## Estimated Scope

~3–4 files changed: BookingForm component, public booking endpoint handler, booking service layer. Small-to-medium change.
