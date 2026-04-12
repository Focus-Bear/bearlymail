# Plan: #1407 — Add expand icon when email content is truncated (forwarded threads)

**Branch:** `openclaw/monk-1407-email-expand`
**Author:** monk-of-modularity[bot] (AI planning agent)

## Problem

Forwarded emails have their thread content cut off at the bottom with no way to see the rest. The email body is aggressively cleaned by `extractCleanHtmlBody` and `extractCleanBody`, which strip everything after forwarded/quoted boundaries. Users see a truncated email with no indication that content was removed, and no way to view the original full content.

## Investigation

### How email body truncation works

Two utility functions in `client/src/utils/emailBodyUtils.ts` actively strip forwarded/quoted content:

1. **`extractCleanHtmlBody(htmlBody)` (line 118):** Parses the HTML, searches for boundary patterns (e.g., "On [date] wrote:", "-----Original Message-----", "From: <email> Sent: ... Subject:"), and truncates the HTML at the first boundary found. Returns only the content before the boundary.

2. **`extractCleanBody(emailBody, htmlBody)` (line 435):** Same logic for plain-text bodies — finds boundary patterns and cuts content there. Also strips lines starting with `>` (quoted content).

### Where truncated content is rendered

| Component                                             | File                           | How body is processed                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EmailThreadView** (single email, no thread)         | `EmailThreadView.tsx` line 175 | `sanitizeAndProcessHtml(extractCleanHtmlBody(htmlBody))` — **strips forwarded content**                                                                                    |
| **EmailThreadView** (thread items, expanded)          | `EmailThreadView.tsx` line 138 | Same: `sanitizeAndProcessHtml(extractCleanHtmlBody(rawHtmlBody))` — **strips forwarded content**                                                                           |
| **EmailThreadView** (thread items, collapsed preview) | `EmailThreadView.tsx` line 150 | `cleanBody.substring(0, 100)` — uses `extractCleanBody` which also strips                                                                                                  |
| **EmailDetailBody**                                   | `EmailDetailBody.tsx`          | `sanitizeAndProcessHtml(extractCleanHtmlBody(removeSignature(htmlBody, true)))` — **strips forwarded content** (but this component is NOT currently used in the main flow) |
| **ThreadItemBody**                                    | `ThreadItemBody.tsx`           | `sanitizeAndProcessHtml(extractCleanHtmlBody(removeSignature(htmlBody)))` — **strips forwarded content**                                                                   |

### Key insight

The truncation is NOT caused by CSS overflow/height constraints. It's caused by **JavaScript actively removing** the forwarded/quoted content from the HTML before rendering. The original full content (`htmlBody` / `body`) is available in the email object but is processed through `extractCleanHtmlBody` which discards it.

### The EmailBodyIframe auto-sizes

`EmailBodyIframe.tsx` uses a `ResizeObserver` on the iframe's `document.body` to auto-set `height` to `scrollHeight + 10`. There is no `maxHeight` constraint. If full content were passed in, it would render fully.

## Proposed Changes

### Step 1: Track whether content was truncated

**File:** `client/src/utils/emailBodyUtils.ts`

Add a variant of `extractCleanHtmlBody` (or modify the return type) that also returns a boolean indicating whether content was stripped:

```typescript
interface CleanHtmlResult {
  html: string;
  wasTruncated: boolean;
}

export function extractCleanHtmlBodyWithMeta(
  htmlBody: string,
): CleanHtmlResult {
  // ... same logic as extractCleanHtmlBody ...
  // Return { html: truncatedHtml, wasTruncated: cutoffIndex < textContent.length }
}
```

Similarly for `extractCleanBody`:

```typescript
interface CleanBodyResult {
  text: string;
  wasTruncated: boolean;
}
```

### Step 2: Add expand/collapse toggle to EmailThreadView

**File:** `client/src/components/email-detail/EmailThreadView.tsx`

For both the single-email view and individual thread items:

1. Call `extractCleanHtmlBodyWithMeta` instead of `extractCleanHtmlBody`.
2. If `wasTruncated === true`, render an expand chevron/button below the body.
3. Track expanded state per email ID (local `useState<Set<string>>`).
4. When expanded, re-render the body with the full `htmlBody` passed through `sanitizeAndProcessHtml` only (skip `extractCleanHtmlBody`).

```tsx
// Pseudocode for the expand toggle
const [expandedBodies, setExpandedBodies] = useState<Set<string>>(new Set());

const { html: cleanHtml, wasTruncated } =
  extractCleanHtmlBodyWithMeta(rawHtmlBody);
const isBodyExpanded = expandedBodies.has(threadEmail.id);
const displayHtml = isBodyExpanded
  ? sanitizeAndProcessHtml(rawHtmlBody)
  : sanitizeAndProcessHtml(cleanHtml);

// After the EmailBodyIframe:
{
  wasTruncated && (
    <ExpandCollapseButton
      isExpanded={isBodyExpanded}
      onToggle={() => toggleExpandedBody(threadEmail.id)}
    />
  );
}
```

### Step 3: Create ExpandCollapseButton component

**File:** `client/src/components/email-detail/ExpandCollapseButton.tsx` (new)

A simple button/row at the bottom of the email body:

- Collapsed state: `▼ Show full message` (or chevron-down icon + i18n text)
- Expanded state: `▲ Hide quoted content` (or chevron-up icon + i18n text)
- Styled as a subtle, full-width clickable bar with a light background
- Use `theme.colors.text.tertiary` for text, `theme.colors.background.subtle` for background
- Include a thin top border to visually separate from the email body

### Step 4: Apply same pattern to ThreadItemBody

**File:** `client/src/components/email-detail/ThreadItemBody.tsx`

Currently uses `extractCleanHtmlBody` inline. Update to use the `WithMeta` variant and add the same expand/collapse toggle. Since `ThreadItemBody` doesn't manage its own state, pass `isExpanded` and `onToggle` as props, with state managed by the parent.

### Step 5: i18n

Add translation keys:

- `emailDetail.showFullMessage` → "Show full message"
- `emailDetail.hideQuotedContent` → "Hide quoted content"

## Testing

1. **Forwarded email:** Open a forwarded email → should see truncated body with "Show full message" button → click → full forwarded thread appears → click "Hide quoted content" → collapses back.
2. **Thread with forwarded items:** Expand a thread item that contains forwarded content → same expand/collapse behaviour per thread item.
3. **Non-truncated email:** Regular email with no forwarded content → no expand button shown.
4. **Plain-text emails:** Same behaviour for plain-text bodies processed by `extractCleanBody`.
5. **Split view panel:** Verify expand/collapse works in the split-view panel (SplitViewPanel renders EmailDetail with `compactMode`).
6. **Performance:** Memoisation in `EmailThreadView` (React.memo) should still work — the `expandedBodies` state is local, so toggling doesn't cause parent re-renders.

## Risks

- **`extractCleanHtmlBody` modifies HTML structure:** The function finds a cutoff in the text content and maps it back to an HTML position, which can result in broken HTML. When showing the full content, we skip this function entirely and just pass through `sanitizeAndProcessHtml`, which is safe.
- **Very large forwarded threads:** Expanding could render a lot of content. The `EmailBodyIframe` auto-sizes, so the page will scroll. This is acceptable — users explicitly asked to see more.
- **`removeSignature` interaction:** In `EmailDetailBody.tsx`, `removeSignature` is called before `extractCleanHtmlBody`. In `EmailThreadView.tsx`, `removeSignature` is NOT called on thread item HTML bodies (only on collapsed preview text via `extractCleanBody`). The expand feature should preserve this existing behaviour — when expanded, show full content minus signature.

## Estimated Effort

Medium — requires modifying utility return types, adding state management, and a new component. ~3-4 hours implementation + testing.
