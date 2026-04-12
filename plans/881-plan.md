# Plan: Loading Indicator During Tone Check on Send (Issue #881)

**Branch:** `monk/881-send-tone-check-loading`  
**Issue:** #881 — No loading indicator during tone check when sending  
**Author:** Monk of Modularity (AI planning agent)

> **⚠️ NOTE:** This issue was already fixed in PR #898 (merged 2026-03-15). This plan is written retrospectively to maintain the audit trail and document what was done. No further implementation is needed.

---

## Problem Statement

When a user clicks "Send" in the reply composer or the full Compose page, a tone check is performed by calling `POST /llm/check-tone`. This is an LLM-backed network request that can take 2–5 seconds. During this time:

- The Send button appears non-responsive.
- There is no spinner or status text.
- The UI appears frozen — users may click Send again or be confused about whether the action was registered.

Affected surfaces:

1. **Reply composer** (`email-detail-inline/ButtonRow.tsx`) — inline reply footer
2. **Full Compose page** (`pages/Compose.tsx` + `components/compose/ComposeActions.tsx`)

---

## Root Cause

The `checkingTone` state was tracked in `useEmailDetailToneCheck` and `useEmailDetailOperations`, but:

1. `ButtonRow.tsx` in the reply composer did not render any spinner or text change during `checkingTone === true`.
2. `ComposeActions.tsx` had a disabled send button but no visible spinner or label change during tone check.

---

## Solution (as implemented in PR #898)

### Reply Composer — `ButtonRow.tsx`

Added an `InlineSpinner` component to the send button that renders when `checkingTone || sending`:

```tsx
{
  (checkingTone || sending) && <InlineSpinner size={14} />;
}
{
  buttonText;
}
```

The `getButtonText()` helper in `useReplyComposerFooter.ts` already returns `t('emailDetail.checkingTone')` when `checkingTone` is true — so the text changes to "Checking tone…" and a spinner appears.

### Full Compose — `ComposeActions.tsx`

Added an equivalent spinner inside `SendButtonContent`:

```tsx
if (checkingTone) {
  return (
    <>
      <span style={SPINNER_STYLE} />
      {t("emailDetail.checkingTone")}
    </>
  );
}
```

The `SPIN_KEYFRAMES` CSS animation and inline `SPINNER_STYLE` were already present in the file for the `sending` state — the `checkingTone` branch simply reuses the same pattern.

### State flow (unchanged)

- `setCheckingTone(true)` is called at the start of the tone-check API call in `useEmailDetailToneCheck.checkTone()` and in `useEmailDetailOperations.handleSendReply()`.
- `setCheckingTone(false)` is called in the `finally` block.
- The Send button's `isDisabled` was already tied to `checkingTone` — this prevented double-sends; the visual indicator was simply missing.

---

## Files Changed (in PR #898)

| File                                                      | Change                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `client/src/components/email-detail-inline/ButtonRow.tsx` | Added `InlineSpinner` during `checkingTone \|\| sending`; imported `InlineSpinner` from common components |
| `client/src/components/compose/ComposeActions.tsx`        | Added `checkingTone` branch to `SendButtonContent` with spinner + i18n label                              |

No server-side changes. No new components created.

---

## Acceptance Criteria (all met by PR #898)

1. **Reply composer — spinner visible:** Clicking Send in the reply composer shows a spinner and "Checking tone…" label during the tone-check LLM call.
2. **Full compose — spinner visible:** Clicking Send in the full Compose page shows a spinner and "Checking tone…" label.
3. **Send button remains disabled:** During tone check, the button cannot be clicked again (prevents double-send).
4. **Normal flow unaffected:** After tone check passes, the flow proceeds to actual send with the "Sending…" indicator as before.
5. **Tone issue flow unaffected:** If tone check fails (suggestions returned), the spinner disappears and the suggestion banner appears normally.
6. **No regression:** Scheduling, discard, and other compose actions are unaffected.

---

## Out of Scope

- Progress percentage or estimated time remaining.
- Cancelling an in-flight tone check.
- Offline / error state UI for tone check failure (covered by the existing error catch path).
