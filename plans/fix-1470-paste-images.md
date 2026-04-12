# Plan: Fix image paste in reply composer (#1470)

**Issue:** https://github.com/Focus-Bear/BearlyMail/issues/1470
**Author:** Monk of Modularity (AI agent)
**Status:** Ready for implementation

## Problem

When pasting an image (Ctrl+V / Cmd+V from clipboard) into the reply composer, the composer breaks immediately. The pasted image shows as a broken image icon because the editor inserts `<img src="cid:inline-UUID@bearlymail">` — a CID reference that has no meaning in the browser's rendering context. The browser can't resolve `cid:` URLs, so it shows a broken image placeholder, making it look like the paste failed or the editor is broken.

## Root Cause Analysis

### Current paste flow (`RichTextEditor.tsx` → `buildPasteHandler`)

1. User pastes an image from clipboard
2. `handlePaste` intercepts the `ClipboardEvent`
3. Image files are detected via `item.kind === 'file'` + `file.type.startsWith('image/')`
4. For each image file:
   - A CID is generated: `inline-${crypto.randomUUID()}@bearlymail`
   - An `<img src="cid:${cid}">` node is inserted into the ProseMirror document
   - `onInlineImage(cid, file)` is called to register the file for MIME attachment
5. The editor renders `<img src="cid:inline-xxx@bearlymail">` — **broken image**

### Why CID is correct for email but wrong for preview

The CID approach is correct for the **sent email** — when the email is constructed as MIME multipart, `cid:` references resolve to inline attachments. But during **editing**, the browser needs a renderable URL. The standard approach is to use `URL.createObjectURL(file)` for the editor preview, then swap to `cid:` at send time.

## Plan

### Step 1: Use blob URLs for editor preview, CID for send

**File:** `client/src/components/rich-text/RichTextEditor.tsx`

Modify `buildPasteHandler` to:

1. Create a blob URL for each pasted image: `const blobUrl = URL.createObjectURL(file)`
2. Insert `<img src="${blobUrl}" data-cid="${cid}">` into the editor (blob URL renders correctly in the browser)
3. Still call `onInlineImage(cid, file)` to register the CID→File mapping for send

```typescript
// In buildPasteHandler, change the image insertion:
imageFiles.forEach((file) => {
  const cid = generateInlineCid();
  const blobUrl = URL.createObjectURL(file);
  _view.dispatch(
    _view.state.tr.replaceSelectionWith(
      _view.state.schema.nodes.image.create({
        src: blobUrl,
        "data-cid": cid,
      }),
    ),
  );
  onInlineImage?.(cid, file);
});
```

### Step 2: Extend TipTap Image extension to support `data-cid` attribute

**File:** `client/src/components/rich-text/RichTextEditor.tsx`

The TipTap Image extension needs to know about the `data-cid` attribute so it's preserved in the document model:

```typescript
Image.configure({ inline: true, allowBase64: true }).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-cid': {
        default: null,
        parseHTML: element => element.getAttribute('data-cid'),
        renderHTML: attributes => {
          if (!attributes['data-cid']) return {};
          return { 'data-cid': attributes['data-cid'] };
        },
      },
    };
  },
}),
```

### Step 3: Convert blob URLs back to CID URLs at send time

**File:** `client/src/hooks/useEmailDetailReplies.ts` (in `buildReplyFormData` or the send preparation logic)

Before sending, walk the HTML and replace `src="blob:..."` with `src="cid:..."` using the `data-cid` attribute:

```typescript
function replaceBlobUrlsWithCids(html: string): string {
  // Replace <img src="blob:..." data-cid="inline-xxx@bearlymail">
  // with   <img src="cid:inline-xxx@bearlymail">
  return html
    .replace(
      /<img([^>]*?)src="blob:[^"]*"([^>]*?)data-cid="([^"]*)"([^>]*?)>/g,
      '<img$1src="cid:$3"$2$4>',
    )
    .replace(
      /<img([^>]*?)data-cid="([^"]*)"([^>]*?)src="blob:[^"]*"([^>]*?)>/g,
      '<img$1src="cid:$2"$3$4>',
    );
}
```

This function should be called on the draft HTML before it's sent to the server. Apply it in:

- `useEmailDetailReplies.ts` → `buildReplyFormData` (where `body` is set)
- `useEmailDetailOperations.ts` → the send handler (where `formData` is built)

### Step 4: Clean up blob URLs on unmount

**File:** `client/src/components/rich-text/RichTextEditor.tsx`

Add cleanup to revoke blob URLs when the editor unmounts to prevent memory leaks:

```typescript
// Track created blob URLs
const blobUrlsRef = useRef<string[]>([]);

// In paste handler, after createObjectURL:
blobUrlsRef.current.push(blobUrl);

// Cleanup on unmount:
useEffect(() => {
  return () => {
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  };
}, []);
```

## File Changes Summary

| File                                                 | Action                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `client/src/components/rich-text/RichTextEditor.tsx` | **MODIFY** — blob URLs for preview, `data-cid` attribute on Image extension, blob URL cleanup |
| `client/src/hooks/useEmailDetailReplies.ts`          | **MODIFY** — add `replaceBlobUrlsWithCids()` before sending                                   |
| `client/src/hooks/useEmailDetailOperations.ts`       | **MODIFY** — add `replaceBlobUrlsWithCids()` before sending                                   |

### Utility file (optional)

Consider extracting `replaceBlobUrlsWithCids()` and `generateInlineCid()` into a shared utility file:

- **New file:** `client/src/utils/inlineImageUtils.ts`

## Testing

1. **Paste image from clipboard** → image should render as a visible preview in the editor (not a broken icon)
2. **Paste multiple images** → all should render correctly
3. **Send reply with pasted image** → email should arrive with the image visible as an inline attachment
4. **Paste non-image file** → should still be added as a regular attachment (existing behaviour)
5. **Drag-and-drop image** → verify existing drag-drop still works (separate code path via `useDragFiles`)
6. **Copy-paste text with image from web page** → should handle mixed content gracefully
7. **Close composer without sending** → verify no memory leaks (blob URLs revoked)

## Risk Assessment

- **Medium risk** — touches the paste handler and send path, both critical flows
- The regex-based HTML replacement in Step 3 should be tested with edge cases (multiple images, attributes in different orders)
- Blob URL cleanup is important for memory but non-critical for functionality
- No backend changes needed — the server already handles CID inline attachments correctly
