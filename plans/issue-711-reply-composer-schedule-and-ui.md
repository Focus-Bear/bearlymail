# Plan: Reply Composer — Fix Scheduled Sending, Clean Up Bottom UI, Add "Still Need to Action" Checkbox (Fixes #711)

## Problem Summary

Three distinct UX/functional issues with the inline reply composer in EmailDetail:

1. **Scheduled sending is broken** — The Schedule button opens the TimePicker and sets a `scheduledSendAt` date, but when the user clicks Send, the scheduled time is not correctly propagated to `handleSendReply`. The `onClearSchedule` handler is also missing from `EmailDetail.tsx`, so the clear (×) button never renders.

2. **Bottom UI is cluttered** — The Expected Reply options, Schedule button, Cancel, and Send buttons are stacked in a dense layout. Needs a cleaner, more intuitive arrangement.

3. **Missing "Still need to action" checkbox** — Users need a way to send an email and keep it in the Action tab (rather than having it auto-archived or snoozed) — a "Still need to action" checkbox.

---

## Affected Files

- `client/src/pages/EmailDetail.tsx` — missing `onClearSchedule`, `sched` parameter type mismatch
- `client/src/components/email-detail-inline/ReplyComposerFooter.tsx` — UI layout + checkbox addition
- `client/src/components/email-detail-inline/ReplyComposer.tsx` — prop forwarding for clear schedule
- `client/src/hooks/useEmailDetailTimePicker.ts` — minor, may need `handleClearSchedule` export
- `client/src/hooks/useEmailDetailOperations.ts` — ensure `scheduledSendAt` is properly handled post-send

---

## Fix 1: Scheduled Sending Bug

### Root Cause

In `EmailDetail.tsx` line ~256, the `onSend` callback:

```tsx
// Current (broken)
onSend={(files: File[], hrs: number, _fwd: string[], draft: string, sched: string) =>
  ops.handleSendReply(files, hrs, draft, sched)}
```

Issues:

1. `sched` is typed as `string` but is actually `Date | undefined` at runtime
2. `ops.handleSendReply(files, hrs, draft, sched)` maps args as: `files, expectedReplyHours, draftOverride, scheduledSendAt` — which appears correct positionally BUT the TypeScript type mismatch may cause runtime issues in some paths
3. `onClearSchedule` is not wired at all — the "×" button never renders in the footer

### Fix

**In `EmailDetail.tsx`:**

```tsx
// Fixed — correct types and wire onClearSchedule
onSend={(files: File[], hrs: number, _fwd: string[], draft: string, sched?: Date) =>
  ops.handleSendReply(files, hrs, draft, sched)}
onClearSchedule={() => setScheduledSendAt(null)}
```

Expose `setScheduledSendAt` from `useEmailDetailTimePicker` (already returned by the hook).

**Verify `handleSendReply` signature in `useEmailDetailOperations.ts`:**

```ts
const handleSendReply = useCallback(async (
  files: File[] = [],
  expectedReplyHours?: number,
  draftOverride?: string,
  scheduledSendAt?: Date  // ← must accept Date
) => { ... }
```

The implementation already uses `scheduledSendAt?.toISOString()` correctly. Just ensure the type flows correctly from `EmailDetail.tsx`.

---

## Fix 2: Bottom UI Cleanup

### Current Layout (cluttered)

```
[Expected Reply: label]  [None] [24h] [48h] [3d] [7d]
                         [Cancel] [Schedule] [Send]
```

### Proposed Cleaner Layout

```
[Row 1: Scheduling]  [🕐 Scheduled for Mon 9am  ×]   (only when scheduled)

[Row 2: Actions]     [Cancel]   [🕐 Schedule ▾]   [Send]

[Row 3: Expected Reply — collapsed/minimal by default, expand on focus]
Expected reply: [None ▾]   (single compact dropdown instead of button group)
```

**Changes to `ReplyComposerFooter.tsx`:**

1. Move Expected Reply to a compact `<select>` dropdown (saves horizontal space)
2. Move Schedule button to be an icon-button (🕐) in the action row, inline with Send
3. Show the scheduled time indicator (🕐 Mon 9am ×) above the action buttons, not inline
4. Keep Cancel and Send buttons as the primary visible actions

```tsx
// Proposed ReplyComposerFooter structure
<div
  style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}
>
  {/* Scheduled time indicator — only when scheduled */}
  {scheduledSendAt && (
    <div className="scheduled-indicator">
      🕐{" "}
      {t("compose.scheduledFor", {
        time: formatScheduledTime(scheduledSendAt),
      })}
      {onClearSchedule && <button onClick={onClearSchedule}>×</button>}
    </div>
  )}

  {/* Still need to action checkbox */}
  <label>
    <input
      type="checkbox"
      checked={keepInAction}
      onChange={(e) => setKeepInAction(e.target.checked)}
    />
    {t("emailDetail.stillNeedToAction")}
  </label>

  {/* Expected reply (compact dropdown) */}
  <div className="expected-reply-row">
    <span>{t("emailDetail.expectedReply.label")}:</span>
    <select
      value={expectedReplyHours}
      onChange={(e) => setExpectedReplyHours(Number(e.target.value))}
      disabled={keepInAction}
    >
      {EXPECTED_REPLY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {getOptionLabel(opt)}
        </option>
      ))}
    </select>
  </div>

  {/* Action buttons */}
  <div className="action-buttons">
    <button onClick={onClose} disabled={isDisabled}>
      {t("common.cancel")}
    </button>
    {onSchedule && (
      <button
        onClick={onSchedule}
        disabled={isDisabled}
        title={t("emailDetail.schedule")}
      >
        🕐
      </button>
    )}
    <button onClick={handleSend} disabled={isDisabled}>
      {getButtonText()}
    </button>
  </div>
</div>
```

---

## Fix 3: "Still Need to Action" Checkbox

### Behaviour

When checked:

- After sending, the email stays in the Action inbox (not archived or snoozed)
- The Expected Reply dropdown is disabled/irrelevant (since we're not tracking a reply deadline)
- `expectedReplyHours` is sent as `undefined` (no snooze)

### Implementation

**Add state in `ReplyComposerFooter`:**

```tsx
const [keepInAction, setKeepInAction] = useState(false);
```

**Modify `handleSend`:**

```tsx
const handleSend = () => {
  captureEvent("reply_sent", {
    expected_reply_hours:
      !keepInAction && expectedReplyHours > 0 ? expectedReplyHours : null,
    keep_in_action: keepInAction,
  });
  onSend(
    keepInAction ? 0 : expectedReplyHours, // 0 = archive immediately; keepInAction bypasses snooze logic
    undefined,
    scheduledSendAt || undefined,
    keepInAction,
  );
};
```

**Update `ReplyComposerFooter` prop types:**

```tsx
interface ReplyComposerFooterProps {
  // ...existing props...
  onSend: (
    expectedReplyHours?: number,
    draftOverride?: string,
    scheduledSendAt?: Date,
    keepInAction?: boolean,
  ) => void;
}
```

**Update `ReplyComposer.handleSend`** to pass `keepInAction` through:

```tsx
const handleSend = (
  expectedReplyHours?: number,
  draftOverride?: string,
  scheduledAt?: Date,
  keepInAction?: boolean,
) => {
  onSend(
    files,
    expectedReplyHours,
    forwardAttachmentIds.length > 0 ? forwardAttachmentIds : undefined,
    draftOverride,
    scheduledAt,
    keepInAction,
  );
};
```

**Update `handleSendReply` in `useEmailDetailOperations.ts`** to handle `keepInAction`:

```ts
const handleSendReply = useCallback(async (
  files: File[] = [],
  expectedReplyHours?: number,
  draftOverride?: string,
  scheduledSendAt?: Date,
  keepInAction?: boolean
) => {
  // ...existing tone check...

  // Post-send behaviour
  if (keepInAction) {
    // Do nothing — email stays in Action tab
    showSuccess(t('emailDetail.replySentSuccess'));
  } else if (scheduledSendAt) {
    showSuccess(t('emailDetail.replyScheduledSuccess'));
  } else if (expectedReplyHours !== undefined) {
    if (expectedReplyHours === 0) {
      performArchiveAfterReply();
    } else {
      const duration = /* ... */;
      performSnoozeAfterReply(duration);
    }
  } else {
    navigate(getInboxPath());
  }
});
```

**Add i18n key:**

```json
"emailDetail": {
  "stillNeedToAction": "Still need to action"
}
```

---

## Files to Change

| File                                                                     | Change                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `client/src/pages/EmailDetail.tsx`                                       | Fix `onSend` type, wire `onClearSchedule`            |
| `client/src/components/email-detail-inline/ReplyComposerFooter.tsx`      | Add checkbox, compact Expected Reply, clean layout   |
| `client/src/components/email-detail-inline/ReplyComposer.tsx`            | Pass `keepInAction` through `handleSend`             |
| `client/src/hooks/useEmailDetailOperations.ts`                           | Handle `keepInAction` in `handleSendReply`           |
| `client/src/hooks/useEmailDetailTimePicker.ts`                           | Expose `handleClearSchedule` if not already returned |
| `client/public/locales/en/translation.json`                              | Add `emailDetail.stillNeedToAction` key              |
| `client/src/components/email-detail-inline/ReplyComposerFooter.test.tsx` | Update/add tests                                     |

---

## Testing

1. **Schedule sending:**
   - Click Schedule → TimePicker appears → select a future time → time indicator shows
   - Click Send → verify API receives `scheduledSendAt` ISO string
   - Click × on the time indicator → clears the scheduled time
   - Verify `t('emailDetail.replyScheduledSuccess')` toast appears after scheduled send

2. **Still need to action checkbox:**
   - Check "Still need to action" → Expected Reply dropdown grays out
   - Send email → email remains in Action tab (not archived/snoozed)
   - Uncheck → normal behavior resumes

3. **UI layout:**
   - Verify compact layout on mobile and desktop viewports
   - Expected Reply uses dropdown, not button group

4. **Regression:**
   - Normal reply (no schedule, no keepInAction) still works
   - Reply with expected reply hours still snoozes/archives correctly

---

## Notes

- Keep backward compatibility — `keepInAction` is optional and defaults to `false`
- The `onClearSchedule` prop already exists in `ReplyComposerFooter` — it just wasn't being passed from `EmailDetail.tsx`
- Consider adding a PostHog event for `keep_in_action_used` to measure adoption
