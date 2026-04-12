# Plan: #978 — Email composer laggy when typing

**Branch:** `plan/978-composer-laggy-typing`
**Author:** monk-of-modularity[bot] (AI planning agent)

## Problem

The email composer (reply and compose windows) is noticeably laggy when the user types — each keystroke causes a visible delay.

## Investigation

### Root Cause: Expensive re-renders on every keystroke

The typing lag is caused by React state updates on every keystroke propagating up through the component tree and causing expensive re-renders.

**Primary culprit: Draft state in `EmailDetail`**

In the reply composer flow, every keystroke in TipTap fires `onUpdate` → `onChange(html)` → `onDraftChange(html)` → `setDraft(html)` which is state on the root `EmailDetail` component. Re-rendering `EmailDetail` re-renders the entire email thread view including `EmailThreadView`, which does expensive DOMParser work on every message.

**Fix already applied (partial):** `useEmailDetailDraftHandlers` (Fix #978 noted in code) debounces `setDraft` by 300ms. This reduces the frequency of expensive re-renders.

### Remaining Issues

**Issue 1: `onChange` in `RichTextEditor` is not stable across renders**

`RichTextEditor.tsx` accepts `onChange: (html: string) => void` as a prop. In `ReplyDraftTextarea`, this is `onDraftChange` passed directly from the parent. If the parent re-renders (even cheaply), `onDraftChange` is a new function reference and TipTap's `editorProps.handlePaste` and the `useEditor` config become stale or trigger re-initialization.

Specifically, `useEditor` receives `editorProps: { handlePaste: buildPasteHandler(onPasteFiles, onInlineImage) }`. `buildPasteHandler` is called inside `useEditor` but `onPasteFiles` and `onInlineImage` are closures — if they're unstable, they capture stale values.

**Issue 2: `buildPasteHandler` captures `onPasteFiles`/`onInlineImage` by closure at editor creation time**

The paste handler is created once when `useEditor` initializes. If `onPasteFiles` changes (e.g. parent re-renders with new file state), the paste handler uses the stale version. This is a closure stale-reference bug, not a typing lag bug per se, but related.

**Issue 3: `useEditor` extensions array rebuilt on every render**

The extensions array in `useEditor` is defined inline:

```tsx
extensions: [
  StarterKit.configure({ ... }),
  BulletList.extend({ ... }),
  // ...
  createLinkShortcut(() => linkShortcutCallbackRef.current()),
]
```

These are recreated on every render. TipTap uses deep comparison but still does work to verify they haven't changed. Moving extensions to a stable `useMemo` or module-level constant would help.

**Issue 4: `handleDraftChange` in `ReplyComposer.tsx` is not wrapped in `useCallback`**

```tsx
// Line ~177 in ReplyComposer.tsx (inside useReplyComposerState return value)
const handleDraftChange = (newDraft: string) => {
  onDraftChange(newDraft);
};
```

This is a plain function inside the hook, recreated on every call. Since it's passed to `ReplyDraftTextarea` as `onDraftChange` → `RichTextEditor` as `onChange`, it causes `RichTextEditor` to re-render with new props on every re-render of the parent.

**Issue 5: Compose page — `form.setBody` is passed directly**

In `Compose.tsx` line 329: `onBodyChange={form.setBody}`. `setBody` is a `useState` setter — stable across renders. This path is fine.

## Proposed Fixes

### Fix 1: Wrap `handleDraftChange` in `useCallback` in `useReplyComposerState`

```tsx
// In ReplyComposer.tsx, useReplyComposerState:
const handleDraftChange = useCallback(
  (newDraft: string) => {
    onDraftChange(newDraft);
  },
  [onDraftChange],
);
```

### Fix 2: Stabilize `RichTextEditor` extensions with `useMemo`

```tsx
// In RichTextEditor.tsx:
const extensions = useMemo(() => [
  StarterKit.configure({ ... }),
  // ...
  createLinkShortcut(() => linkShortcutCallbackRef.current()),
], []); // stable — createLinkShortcut uses ref so no deps needed

const editor = useEditor({ extensions, content: content || '', ... });
```

### Fix 3: Use a ref for the paste handler to avoid stale closures

```tsx
const onPasteFilesRef = useRef(onPasteFiles);
const onInlineImageRef = useRef(onInlineImage);
useEffect(() => {
  onPasteFilesRef.current = onPasteFiles;
}, [onPasteFiles]);
useEffect(() => {
  onInlineImageRef.current = onInlineImage;
}, [onInlineImage]);

// In useEditor editorProps:
editorProps: {
  handlePaste: (_view, event) =>
    buildPasteHandler(onPasteFilesRef.current, onInlineImageRef.current)(
      _view,
      event,
    );
}
```

Or more cleanly: build the paste handler once with refs:

```tsx
const pasteHandler = useMemo(
  () => buildPasteHandlerWithRefs(onPasteFilesRef, onInlineImageRef),
  [],
);
```

### Fix 4: Wrap `ReplyDraftTextarea` with `React.memo`

```tsx
export const ReplyDraftTextarea = React.memo(({ ... }) => {
  return <RichTextEditor ... />;
});
```

This prevents re-renders when parent re-renders but props are stable.

## Files to Change

| File                                                               | Change                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `client/src/components/email-detail-inline/ReplyComposer.tsx`      | Wrap `handleDraftChange` in `useCallback`                     |
| `client/src/components/rich-text/RichTextEditor.tsx`               | Memoize extensions array; use refs for paste handler closures |
| `client/src/components/email-detail-inline/ReplyDraftTextarea.tsx` | Wrap with `React.memo`                                        |

## Status Note

The debounce fix in `useEmailDetailDraftHandlers` (tagged "Fix #978" in code comments) addresses the expensive state propagation path. The remaining issues (unstable callbacks, extensions array) are secondary causes that contribute to lag especially on lower-end devices. All fixes are safe incremental improvements.

## Testing

1. Open reply composer on a long email thread
2. Type quickly — no perceptible lag
3. Verify tone check, draft switching, and file paste still work
4. Test in Compose page (standalone) — should be fast already
5. Use React DevTools Profiler to confirm reduced render counts per keystroke
