# Plan: Fix #1157 — Scroll to category header after archiving all emails

**Branch:** `openclaw/issue-1157/scroll-to-category-after-archive-plan`
**Author:** Monk of Modularity (AI agent), subagent of Laoban
**Priority:** P2 — UX improvement, no functional regression
**Linked issue:** #1157

---

## Problem Statement

When a user archives all emails in a category (via the "Archive All" button), the inbox:

1. Archives all emails in the category
2. Collapses the accordion (correct)
3. **Leaves the scroll position unchanged** (bug)

The user ends up staring at an empty area of the screen, or worse, the previous scroll position no longer corresponds to any meaningful content. The expected behaviour is: after the category collapses, the inbox should scroll so the **next visible category header** is visible at the top of the viewport (or, if the archived category was the last one, scroll to maintain the user's context by showing the preceding category).

---

## Root Cause Analysis

There are **two archiving paths** that trigger this collapse, and neither performs scroll restoration:

### Path A — "Archive All" button → `handleConfirmArchive` in `CategoryAccordion.tsx`

**File:** `client/src/components/inbox/CategoryAccordion.tsx`, ~line 359

```ts
const handleConfirmArchive = useCallback(async () => {
  setShowArchiveConfirmation(false);
  if (onArchiveAll) {
    await onArchiveAll(category, emailIds);
    // ← collapse called here, no scroll
    onToggle();
  }
}, [onArchiveAll, category, emailIds, onToggle]);
```

After `onToggle()` the accordion collapses, but nothing scrolls.

### Path B — Archive one-by-one → auto-collapse `useEffect` in `InboxCategoryItem` (InboxContentParts.tsx)

**File:** `client/src/components/inbox/InboxContentParts.tsx`, ~line 226

```ts
useEffect(() => {
  if (isLoaded && categoryEmails.length === 0 && isExpanded && categoryItem.count === 0) {
    onToggleCategory(categoryKey);
    // ← collapse called here, no scroll either
  }
}, [...]);
```

Also auto-collapses in `CategoryAccordion.tsx` ~line 330 when `emails.length` drops to 0 while expanded.

### Why scroll restoration is missing

The `emailListRef` (pointing to the scrollable `<div>` in `InboxEmailListPanel`) is available at the `InboxContent` level and is passed down as a prop. However:

- `CategoryAccordion` has no access to `emailListRef`
- `InboxCategoryItem` has no access to `emailListRef`
- No ref is attached to individual `CategoryAccordion` root elements to identify their scroll position
- There is no mechanism to capture a category header's `offsetTop` before archiving, nor to restore it afterward

The accordion header has `position: sticky; top: 0; zIndex: 10` (already handles staying visible while scrolling within), but once the accordion collapses the DOM node shrinks and scroll position is not adjusted.

---

## Implementation Plan

### Approach: Scroll to next visible category header after collapse

When a category collapses (either via archive-all or archive one-by-one), scroll the email list container so the **next category header** after the collapsed one is at the top of the viewport. If the collapsed category was the last one, scroll to the **previous** category header.

This is the cleanest approach because:

- No need to capture `offsetTop` before archiving (the DOM changes are predictable after collapse)
- The next sibling category header will already be visible and correctly positioned after the grid-row animation completes
- Consistent with UX patterns (e.g. after deleting a file in a list, the cursor moves to the next item)

### Step 1 — Add `accordionRef` to `CategoryAccordion`

**File:** `client/src/components/inbox/CategoryAccordion.tsx`

Add a forwarded ref (or expose the container `div` ref via a callback) so the parent can reference the DOM node of each category accordion. This lets `InboxCategoryItem` know the accordion's position in the scroll container.

```tsx
// Export the component with forwardRef
export const CategoryAccordion = React.forwardRef<
  HTMLDivElement,
  CategoryAccordionProps
>((props, ref) => {
  // ... existing logic ...
  return (
    <div
      ref={ref} // ← add this
      style={{
        marginBottom: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      {/* existing children */}
    </div>
  );
});
CategoryAccordion.displayName = "CategoryAccordion";
```

### Step 2 — Add `onAfterCollapse` callback to `CategoryAccordion` props

**File:** `client/src/components/inbox/CategoryAccordion.tsx`

Add an optional `onAfterCollapse?: () => void` prop that is called after both:

- The confirm-archive path (`handleConfirmArchive`) after `onToggle()`
- The auto-collapse path (`useEffect` that monitors `emails.length`)

```tsx
interface CategoryAccordionProps {
  // ...existing props...
  onAfterCollapse?: () => void; // ← new
}

// In handleConfirmArchive:
const handleConfirmArchive = useCallback(async () => {
  setShowArchiveConfirmation(false);
  if (onArchiveAll) {
    await onArchiveAll(category, emailIds);
    onToggle();
    onAfterCollapse?.(); // ← call after toggle
  }
}, [onArchiveAll, category, emailIds, onToggle, onAfterCollapse]);

// In the auto-collapse useEffect:
useEffect(() => {
  if (emails.length > 0) {
    wasExpandedWithEmailsRef.current = isExpanded;
  } else if (wasExpandedWithEmailsRef.current && isExpanded) {
    wasExpandedWithEmailsRef.current = false;
    onToggle();
    onAfterCollapse?.(); // ← call after toggle
  }
}, [emails.length, isExpanded, onToggle, onAfterCollapse]);
```

### Step 3 — Add `emailListRef` and `categoryIndex` to `InboxCategoryItem`

**File:** `client/src/components/inbox/InboxContentParts.tsx`

`InboxCategoryItem` needs:

1. A ref to the scrollable container (`emailListRef`)
2. Its own index in the display list (to find the next/previous category)
3. A ref to its own `CategoryAccordion` DOM node

Add to `InboxCategoryItemProps`:

```tsx
interface InboxCategoryItemProps {
  // ...existing props...
  emailListRef: React.RefObject<HTMLDivElement | null>; // ← new
  categoryIndex: number; // ← new (position in displayCategories)
  totalCategories: number; // ← new (total count for boundary check)
  getCategoryAccordionRef: (
    index: number,
  ) => React.RefObject<HTMLDivElement | null>; // ← new
}
```

Alternatively (simpler): pass `onAfterCollapse` as a direct callback prop from `InboxCategoryList`, computed there where sibling refs are available.

### Step 4 — Implement scroll logic in `InboxCategoryList`

**File:** `client/src/components/inbox/InboxContentParts.tsx`

`InboxCategoryList` renders all `InboxCategoryItem` components and has access to the full `displayCategories` array. It is the right place to create per-accordion refs and implement the scroll logic.

```tsx
// In InboxCategoryList:
const accordionRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

const makeAfterCollapseHandler =
  (categoryKey: string, catIdx: number) => () => {
    const scrollContainer = emailListRef.current;
    if (!scrollContainer) return;

    // Find the next visible category after the collapsed one
    const nextCategoryKey = displayCategories
      .slice(catIdx + 1)
      .find((cat) => getCategoryKey(cat.id, cat.name) !== categoryKey)?.id
      ? getCategoryKey(/* next item */)
      : null;

    // Prefer scrolling to next category; fall back to previous
    const targetKey =
      nextCategoryKey ??
      (catIdx > 0
        ? getCategoryKey(
            displayCategories[catIdx - 1].id,
            displayCategories[catIdx - 1].name,
          )
        : null);

    if (!targetKey) return;

    const targetEl = accordionRefs.current.get(targetKey);
    if (!targetEl) return;

    // Scroll so the target header is at the top of the scroll container
    const containerTop = scrollContainer.getBoundingClientRect().top;
    const targetTop = targetEl.getBoundingClientRect().top;
    const scrollDelta = targetTop - containerTop;

    scrollContainer.scrollBy({ top: scrollDelta, behavior: "smooth" });
  };
```

Pass `emailListRef` down through `InboxEmailListPanel` → `InboxCategoryList`.

### Step 5 — Wire up refs in `InboxCategoryList`

**File:** `client/src/components/inbox/InboxContentParts.tsx`

Pass `ref` to each `CategoryAccordion` (via the forwarded ref in Step 1) and the computed `onAfterCollapse` callback:

```tsx
<InboxCategoryItem
  key={categoryKey}
  // ...existing props...
  accordionRef={/* ref for this category */}
  onAfterCollapse={makeAfterCollapseHandler(categoryKey, catIdx)}
/>
```

And in `InboxCategoryItem`, pass the ref to `CategoryAccordion`:

```tsx
<CategoryAccordion
  ref={accordionRef}
  // ...existing props...
  onAfterCollapse={onAfterCollapse}
>
```

### Step 6 — Handle auto-collapse in `InboxCategoryItem`'s `useEffect`

**File:** `client/src/components/inbox/InboxContentParts.tsx`

The existing auto-collapse `useEffect` in `InboxCategoryItem` also needs to trigger scroll. It currently calls `onToggleCategory(categoryKey)` directly without going through `CategoryAccordion`. Pass `onAfterCollapse` to this useEffect as well:

```tsx
useEffect(() => {
  if (
    isLoaded &&
    categoryEmails.length === 0 &&
    isExpanded &&
    categoryItem.count === 0
  ) {
    onToggleCategory(categoryKey);
    onAfterCollapse?.(); // ← trigger scroll
  }
}, [
  isLoaded,
  categoryEmails.length,
  categoryKey,
  isExpanded,
  onToggleCategory,
  categoryItem.count,
  onAfterCollapse,
]);
```

### Step 7 — Timing: wait for CSS grid collapse animation

The accordion uses a CSS grid `grid-template-rows` transition of 0.25s. Scrolling immediately after `onToggle()` will measure the element at its pre-collapse height. Add a brief delay matching the transition:

```tsx
// In makeAfterCollapseHandler:
const COLLAPSE_ANIMATION_MS = 260; // slightly more than the 0.25s CSS transition

setTimeout(() => {
  // ... scroll logic here ...
}, COLLAPSE_ANIMATION_MS);
```

---

## Files to Change

| File                                                                           | Change                                                                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/inbox/CategoryAccordion.tsx`                            | Add `React.forwardRef` wrapper; add `onAfterCollapse?: () => void` prop; call it in `handleConfirmArchive` and auto-collapse `useEffect` |
| `client/src/components/inbox/InboxContentParts.tsx` — `InboxCategoryItemProps` | Add `accordionRef`, `onAfterCollapse` props                                                                                              |
| `client/src/components/inbox/InboxContentParts.tsx` — `InboxCategoryItem`      | Pass `accordionRef` to `CategoryAccordion`; pass `onAfterCollapse` to `CategoryAccordion` and to the auto-collapse `useEffect`           |
| `client/src/components/inbox/InboxContentParts.tsx` — `InboxCategoryListProps` | Add `emailListRef: React.RefObject<HTMLDivElement \| null>`                                                                              |
| `client/src/components/inbox/InboxContentParts.tsx` — `InboxCategoryList`      | Create `accordionRefs` map; implement `makeAfterCollapseHandler`; pass ref + callback to each `InboxCategoryItem`                        |
| `client/src/components/inbox/InboxContentParts.tsx` — `InboxEmailListPanel`    | Pass `emailListRef` down to `InboxCategoryList`                                                                                          |

---

## Tests to Add / Update

### 1. `CategoryAccordion` — `onAfterCollapse` called after archive-all

**File:** `client/src/components/inbox/categoryAccordion.helpers.test.ts` or new `CategoryAccordion.test.tsx`

```ts
it("calls onAfterCollapse after archive-all confirm", async () => {
  const onAfterCollapse = jest.fn();
  const onArchiveAll = jest.fn().mockResolvedValue(undefined);
  const onToggle = jest.fn();
  // render CategoryAccordion with emails, trigger archive all, confirm
  // expect onAfterCollapse to have been called
});

it("calls onAfterCollapse when auto-collapse fires (emails drop to zero)", async () => {
  const onAfterCollapse = jest.fn();
  // render with emails, rerender with empty emails while isExpanded=true
  // expect onAfterCollapse to have been called
});
```

### 2. `InboxCategoryItem.test.tsx` — `onAfterCollapse` wired through auto-collapse

```ts
it('calls onAfterCollapse when auto-collapsed by empty email list', async () => {
  const onAfterCollapse = jest.fn();
  const { rerender } = render(<InboxCategoryItem {...DEFAULT_PROPS} group={{ emails: [email], name: 'Newsletters' }} onAfterCollapse={onAfterCollapse} />);
  rerender(<InboxCategoryItem {...DEFAULT_PROPS} group={{ emails: [], name: 'Newsletters' }} onAfterCollapse={onAfterCollapse} />);
  await waitFor(() => expect(onAfterCollapse).toHaveBeenCalled());
});
```

### 3. Scroll logic unit test — `makeAfterCollapseHandler`

Extract `makeAfterCollapseHandler` to a pure helper function (e.g. `inboxContentParts.helpers.ts`) and unit-test it:

```ts
it("scrolls to next category when one exists", () => {
  const scrollContainer = {
    scrollBy: jest.fn(),
    getBoundingClientRect: () => ({ top: 0 }),
  };
  const nextEl = { getBoundingClientRect: () => ({ top: 200 }) };
  const accordionRefs = new Map([["cat-2", nextEl]]);
  makeAfterCollapseHandler(
    scrollContainer,
    accordionRefs,
    "cat-1",
    0,
    displayCategories,
  )();
  expect(scrollContainer.scrollBy).toHaveBeenCalledWith({
    top: 200,
    behavior: "smooth",
  });
});

it("falls back to previous category when archived category was last", () => {
  // similar setup with catIdx = last index
});

it("does nothing when no sibling categories exist", () => {
  // single-category inbox — no scroll
});
```

---

## Edge Cases for Codebeard

1. **Single-category inbox**: If there's only one category and it's archived, no scroll target exists. The handler should no-op gracefully.
2. **Last category in list**: Fall back to scrolling to the previous category.
3. **Rapid archive**: User archives one category, then immediately archives another before the scroll animation completes. The 260ms timeout means two scroll operations may overlap. This is acceptable; the second one will just override the first. No state corruption.
4. **Split view open**: When `splitView.selectedEmailId` is non-null, the layout changes (left panel + right panel). The `emailListRef` still points to the left panel scroll container. Scroll logic is unchanged.
5. **Mobile**: On mobile, `isMobile = true` and the layout is a single column. The scroll container is the same `emailListRef`. Works identically.
6. **`InboxCategoryItem` auto-collapse vs `CategoryAccordion` auto-collapse**: There are **two** auto-collapse `useEffect` hooks — one in `InboxCategoryItem` (fires on `categoryEmails.length === 0 && categoryItem.count === 0`) and one inside `CategoryAccordion` itself (fires on `emails.length` transition to 0 while expanded). Both must call `onAfterCollapse`, or one should be removed to avoid double-calling. Codebeard should verify which one fires in practice for the "archive one by one" path and ensure `onAfterCollapse` is called exactly once.

---

## Investigation Notes

- The `CategoryAccordion` header already has `position: sticky; top: 0` so when scrolled into view it will pin to the top naturally. The scroll logic just needs to bring the **next category's** header into the viewport.
- `scrollBy({ behavior: 'smooth' })` is well-supported. It respects `prefers-reduced-motion` natively in modern browsers (scrolls instantly when motion is reduced). No extra handling needed.
- The `accordionRefs` map in `InboxCategoryList` should be a `useRef<Map<...>>` (not `useState`) to avoid re-renders when refs are assigned.
- Alternatively, use `data-category-key` attributes on each `CategoryAccordion` root div and use `emailListRef.current?.querySelector('[data-category-key="..."]')` to find the target. This avoids threading refs but is more brittle (requires stable DOM). Ref-based approach (Step 1–5) is preferred.
- There is already a `scrollEmailIntoView` utility in `useKeyboardShortcuts.ts` that queries `[data-email-index="..."]`. A similar `data-category-key` attribute approach would be consistent with that pattern and avoids the `forwardRef` complexity. **Codebeard may prefer this simpler approach** — add `data-category-key={categoryKey}` to the `CategoryAccordion` root div and use `querySelector` from `emailListRef`. See alternative below.

### Alternative Approach (simpler — data attribute based)

Instead of `React.forwardRef`, add a `data-category-key` attribute to the `CategoryAccordion` root `div`:

**File:** `client/src/components/inbox/CategoryAccordion.tsx`

```tsx
<div
  data-category-key={category}   // ← add this (use stable key, not display name)
  style={{ ... }}
>
```

Then in `InboxCategoryList`'s `makeAfterCollapseHandler`:

```ts
const targetEl = emailListRef.current?.querySelector(
  `[data-category-key="${CSS.escape(targetKey)}"]`,
) as HTMLElement | null;
```

This is simpler (no `forwardRef`, no ref map), at the cost of relying on DOM querying. Given the existing codebase uses `[data-email-index]` for the same pattern, this is acceptable and preferred for consistency.

**Recommendation:** Use the data-attribute approach. It's simpler, consistent with existing patterns, and avoids `forwardRef` boilerplate.

---

Signed-off-by: Monk of Modularity (AI agent), subagent of Laoban
