# Plan: Context Settings UX — Compress Feedback, Verbose Entries, Consolidation Warning (Fixes #710)

## Problem Summary

Three UX gaps in the Guide Our AI → Context Settings section:

1. **Compress Context has no feedback** — After clicking "Compress", the button shows "Compressing..." but gives no success/error notification and doesn't refresh the context list. Users don't know if it worked.

2. **Verbose context entries** — The LLM generates overly wordy context entries (e.g., "Sarah Chen - consistently replies within 5-10 minutes, often multiple emails per day, highly engaged"). These should be concise noun-phrase-style labels (e.g., "Sarah Chen — quick responder, daily emails").

3. **Consolidation warning missing** — Clicking "Consolidate" triggers a potentially slow operation with no warning that it will reload the page and may take a few seconds. Users may think the app hung.

---

## Affected Files

- `client/src/components/settings/guide-ai/ContextSectionsList.tsx` — compress + consolidate UI handlers
- `server/promptfoo/prompts/analyze-email-patterns.md` — LLM prompt for context entry format
- `server/src/context/context.service.ts` — compress endpoint, may need to return updated context
- `client/src/hooks/settings/useRecategorizeProgress.ts` — pattern to follow for compress feedback
- `client/public/locales/en/translation.json` — new i18n strings

---

## Fix 1: Compress Context — Add Feedback

### Current Behaviour

```tsx
const handleCompressContext = async () => {
  setIsCompressing(true);
  try {
    await axios.post(`${API_URL}/context/compress`);
    // ← nothing! no toast, no refresh
  } catch (error) {
    console.error("Failed to compress context:", error);
    // ← no user-visible error
  } finally {
    setIsCompressing(false);
  }
};
```

### Fix

1. **Show success toast** after compression completes.
2. **Refresh the context list** so users can see the compressed entries immediately.
3. **Show error toast** if compression fails.

```tsx
const handleCompressContext = async () => {
  setIsCompressing(true);
  try {
    await axios.post(`${API_URL}/context/compress`);
    // Fetch updated contexts from parent
    await onRefreshContexts?.();
    showToast(t("settings.context.compressSuccess"), "success");
  } catch (error) {
    console.error("Failed to compress context:", error);
    showToast(t("settings.context.compressError"), "error");
  } finally {
    setIsCompressing(false);
  }
};
```

**Required changes:**

a. **Add `onRefreshContexts` prop to `ContextSectionsList`:**

```tsx
interface ContextSectionsListProps {
  // ...existing props...
  onRefreshContexts?: () => Promise<void>;
}
```

b. **Wire it from `GuideOurAISection` → `ContextSectionsList`**, where the parent already has a way to re-fetch contexts (via `useSettingsData`).

c. **Add toast utility** — BearlyMail appears to use inline error display; check if there's a global toast/notification system (e.g., `react-hot-toast`, `react-toastify`). If not, add simple inline success message within the button area.

d. **New i18n keys:**

```json
"settings": {
  "context": {
    "compressSuccess": "Context compressed successfully — entries have been simplified.",
    "compressError": "Failed to compress context. Please try again."
  }
}
```

---

## Fix 2: Verbose Context Entries — Prompt Update

### Current Behaviour

The `analyze-email-patterns.md` prompt instructs the LLM to generate entries like:

```
{ "key": "VIP_CONTACT", "value": "Sarah Chen - consistently replies within 5-10 minutes, often multiple emails per day, highly engaged" }
```

These descriptions are overly long and make the context UI hard to scan.

### Fix

Update the `value` format guidance in `analyze-email-patterns.md` to enforce concise noun-phrase style:

**Current instruction (in VIP_CONTACT section):**

```
{ "key": "VIP_CONTACT", "value": "Sarah Chen - consistently replies within 5-10 minutes", "source": "email_analysis" }
```

**Updated instruction:**
Add a constraint block under the Output JSON section:

```markdown
## Context Entry Format Rules

CRITICAL: Keep context values SHORT and scannable. Maximum 10 words per value.

Format guidelines:

- **VIP_CONTACT**: `<Name> — <2-3 word descriptor>` (e.g., "Sarah Chen — daily, quick replies")
- **USER_INFO**: `<Noun phrase>` (e.g., "Plumber based in NYC", "Founder of Focus Bear")
- **NOT_IMPORTANT**: `<Category> <pattern>` (e.g., "Newsletter emails — consistently ignored")
- **URGENT**: `<Trigger condition>` (e.g., "Emails from board members — reply same day")
- **EMAIL_CATEGORY**: `<Short label>` (e.g., "Customer support", "Investor updates")
- **OTHER**: `<Concise insight>` (e.g., "Uses bullet points in replies")

DO NOT write full sentences. DO NOT use phrases like "consistently", "often", "always", "tends to".
Use concrete, scannable noun phrases instead.
```

Also update the existing example:

```markdown
Example context item format:
{ "key": "VIP_CONTACT", "value": "Sarah Chen — quick replies, daily", "source": "email_analysis" }
```

**Also update the compress context endpoint** in `server/src/context/context.service.ts` to apply similar brevity constraints when compressing existing verbose entries. The compress prompt should include:

```
Rewrite each context entry value to be ≤10 words, noun-phrase style. Remove filler words like "consistently", "often", "tends to".
```

---

## Fix 3: Consolidation Warning

### Current Behaviour

```tsx
const handleConsolidateCategories = async () => {
  setIsConsolidating(true);
  try {
    await axios.post(`${API_URL}/context/consolidate-categories`);
    window.location.reload(); // ← sudden page reload, no warning
  } catch (error) {
    console.error("Failed to consolidate categories:", error);
    // ← no user-visible error
  } finally {
    setIsConsolidating(false);
  }
};
```

### Fix

Show a confirmation dialog before triggering consolidation, and show an error if it fails:

```tsx
const handleConsolidateCategories = async () => {
  const confirmed = window.confirm(
    t("settings.emailCategories.consolidateWarning"),
  );
  if (!confirmed) return;

  setIsConsolidating(true);
  try {
    await axios.post(`${API_URL}/context/consolidate-categories`);
    showToast(t("settings.emailCategories.consolidateSuccess"), "success");
    // Small delay so user can see the success toast before reload
    await new Promise((resolve) => setTimeout(resolve, 1500));
    window.location.reload();
  } catch (error) {
    console.error("Failed to consolidate categories:", error);
    showToast(t("settings.emailCategories.consolidateError"), "error");
  } finally {
    setIsConsolidating(false);
  }
};
```

**New i18n keys:**

```json
"settings": {
  "emailCategories": {
    "consolidateWarning": "Consolidating will merge similar email categories and reload the page. This may take a few seconds. Continue?",
    "consolidateSuccess": "Email categories consolidated successfully! Reloading...",
    "consolidateError": "Failed to consolidate categories. Please try again."
  }
}
```

**Optional improvement:** Replace `window.confirm` with a styled `<ConfirmDialog>` modal for a better UX (consistent with the rest of BearlyMail's design system).

---

## Files to Change

| File                                                              | Change                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `client/src/components/settings/guide-ai/ContextSectionsList.tsx` | Compress feedback + consolidation warning                   |
| `client/src/components/settings/GuideOurAISection.tsx`            | Pass `onRefreshContexts` prop down to `ContextSectionsList` |
| `client/src/hooks/useSettingsData.ts`                             | Expose `refreshContexts` callback                           |
| `server/promptfoo/prompts/analyze-email-patterns.md`              | Add brevity constraints for context values                  |
| `server/src/context/context.service.ts`                           | Update compress prompt for brevity                          |
| `client/public/locales/en/translation.json`                       | Add new i18n keys                                           |

---

## Testing

### Compress Context

1. Add several verbose context entries manually.
2. Click "Compress" button.
3. **Expected:** Button shows "Compressing..." → success toast appears → context list updates in place with simplified values.
4. Simulate server error → **Expected:** Error toast appears, no page reload.

### Verbose Context Entries (prompt change)

1. Trigger email analysis (Analyze Context button).
2. Inspect newly generated VIP_CONTACT entries.
3. **Expected:** Values are ≤10 words, noun-phrase style (e.g., "Sarah Chen — quick replies").
4. Run promptfoo tests: `cd server && npm run promptfoo`.

### Consolidation Warning

1. Click "Consolidate" button.
2. **Expected:** Confirmation dialog appears with explanatory message.
3. Click "Cancel" → nothing happens.
4. Click "OK" → button shows "Consolidating..." → success toast → page reloads.
5. Simulate server error → **Expected:** Error toast, no reload.

---

## Edge Cases

- **Compress with no contexts:** Show a "Nothing to compress" toast instead of calling the API.
- **Compress during active analysis:** Disable the compress button while `analyzing` is true.
- **Consolidate with 0 or 1 categories:** Consider skipping the API call and showing "Nothing to consolidate".
- **Context refresh fails after compress:** Show partial success message ("Context compressed, but couldn't refresh the list — please reload the page").

---

## Notes

- `window.confirm` is a quick win for the consolidation warning; if BearlyMail has a modal system, use that instead for visual consistency
- The prompt change for verbosity should be tested against existing promptfoo test cases before merging
- The `onRefreshContexts` prop passes a callback up the component tree — ensure it doesn't cause unnecessary re-renders at the Settings page level
