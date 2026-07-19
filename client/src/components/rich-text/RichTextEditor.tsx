import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BulletList from '@tiptap/extension-bullet-list';
import Color from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import ListItem from '@tiptap/extension-list-item';
import OrderedList from '@tiptap/extension-ordered-list';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { EditorView } from '@tiptap/pm/view';
import { EditorContent, Extension, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { theme } from 'theme/theme';
import { clipboardHtmlHasTable } from 'utils/clipboardUtils';

import { RichTextToolbar } from 'components/rich-text/RichTextToolbar';
import { OPACITY_DISABLED } from 'constants/numbers';
import { TAG_EMPTY_PARAGRAPH } from 'constants/strings';

interface RichTextEditorProps {
  content: string | null;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hasToneError?: boolean;
  onPasteFiles?: (files: File[]) => void;
  /**
   * Called when a pasted image is registered as an inline CID attachment.
   * The parent should store (cid → file) so it can be sent as a MIME inline
   * part instead of a base64 data: URI embedded in the email body.
   */
  onInlineImage?: (cid: string, file: File) => void;
  minHeight?: string;
}

const FILE_KIND = 'file' as const;

const createLinkShortcut = (onTrigger: () => void) =>
  Extension.create({
    name: 'linkShortcut',
    addKeyboardShortcuts() {
      return {
        'Mod-k': () => {
          onTrigger();
          return true;
        },
      };
    },
  });

/**
 * Build a unique Content-ID for an inline image attachment.
 * Format: `inline-{uuid}@bearlymail` — matches the `cid:` src in the editor
 * and the `Content-ID: <...>` MIME header on the server.
 */
function generateInlineCid(): string {
  return `inline-${crypto.randomUUID()}@bearlymail`;
}

/**
 * Convert a data: URI string to a File object so it can be uploaded as a MIME
 * inline attachment, just like a natively pasted image file.
 */
function dataUriToFile(dataUri: string, filename: string): File | null {
  const match = dataUri.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const mimeType = match[1];
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const ext = mimeType.split('/')[1] ?? 'png';
  return new File([bytes], `${filename}.${ext}`, { type: mimeType });
}

function buildPasteHandler(
  onPasteFiles?: (files: File[]) => void,
  onInlineImage?: (cid: string, file: File) => void,
  trackBlobUrl?: (url: string) => void
) {
  return (_view: EditorView, event: ClipboardEvent): boolean => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return false;
    }

    // When the clipboard contains an HTML table (e.g. copied from Excel or Google Sheets),
    // skip image-file handling and let TipTap parse the HTML natively. Excel puts both a
    // PNG screenshot and the HTML table in the clipboard; without this check the image
    // wins and the table is lost.
    if (clipboardHtmlHasTable(clipboardData)) {
      return false;
    }

    const nonImageFiles: File[] = [];
    const imageFiles: File[] = [];

    // Primary: iterate DataTransferItemList (Chrome, Firefox, modern Safari).
    const items = clipboardData.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === FILE_KIND) {
          const file = item.getAsFile();
          if (file) {
            if (file.type.startsWith('image/')) {
              imageFiles.push(file);
            } else {
              nonImageFiles.push(file);
            }
          }
        }
      }
    }

    // Fallback 1: clipboardData.files — covers browsers (e.g. older Safari on Mac)
    // where items may not expose pasted image files.
    if (imageFiles.length === 0 && clipboardData.files.length > 0) {
      for (const file of Array.from(clipboardData.files)) {
        const isDuplicate =
          imageFiles.some(existing => existing.name === file.name && existing.size === file.size) ||
          nonImageFiles.some(existing => existing.name === file.name && existing.size === file.size);
        if (isDuplicate) {
          continue;
        }
        if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        } else {
          nonImageFiles.push(file);
        }
      }
    }

    // Fallback 2: extract data: URI images from clipboard HTML — handles copying
    // images from web pages or email bodies where no file item is present (common
    // on Mac when the image is rendered inline in another app's HTML).
    // Use DOMParser rather than innerHTML on a detached div — innerHTML would
    // trigger the browser to fetch external <img> resources (tracking pixels,
    // referrer leaks) even though we only read data: URIs.
    if (imageFiles.length === 0) {
      const html = clipboardData.getData('text/html');
      if (html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const imgs = doc.querySelectorAll('img[src^="data:image/"]');
        imgs.forEach((img, idx) => {
          const src = img.getAttribute('src') ?? '';
          const file = dataUriToFile(src, `pasted-image-${idx}`);
          if (file) {
            imageFiles.push(file);
          }
        });
      }
    }

    if (imageFiles.length > 0) {
      event.preventDefault();
      imageFiles.forEach(file => {
        const cid = generateInlineCid();
        // Use a blob: URL so the browser can render the image in the editor.
        // The data-cid attribute carries the CID so we can swap blob: → cid:
        // at send time (see replaceBlobUrlsWithCids in inlineImageUtils.ts).
        const blobUrl = URL.createObjectURL(file);
        trackBlobUrl?.(blobUrl);
        _view.dispatch(
          _view.state.tr.replaceSelectionWith(_view.state.schema.nodes.image.create({ src: blobUrl, 'data-cid': cid }))
        );
        onInlineImage?.(cid, file);
      });
      return true;
    }
    if (nonImageFiles.length > 0 && onPasteFiles) {
      event.preventDefault();
      onPasteFiles(nonImageFiles);
      return true;
    }
    return false;
  };
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  placeholder = '',
  disabled = false,
  hasToneError = false,
  onPasteFiles,
  onInlineImage,
  minHeight = '200px',
}) => {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const linkShortcutCallbackRef = useRef(() => setLinkDialogOpen(true));
  // Track blob URLs created for pasted images so we can revoke them on unmount.
  const blobUrlsRef = useRef<string[]>([]);

  // Use refs for paste handler callbacks to avoid stale closures.
  // The paste handler is created once at editor init; refs let it always call
  // the latest prop values without being recreated.
  const onPasteFilesRef = useRef(onPasteFiles);
  const onInlineImageRef = useRef(onInlineImage);
  useEffect(() => {
    onPasteFilesRef.current = onPasteFiles;
  }, [onPasteFiles]);
  useEffect(() => {
    onInlineImageRef.current = onInlineImage;
  }, [onInlineImage]);

  // Memoize extensions so TipTap doesn't rebuild the editor on every render.
  // createLinkShortcut is stable because it reads from linkShortcutCallbackRef.
  // Placeholder is keyed to `placeholder` prop, so it must be in the deps.
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: false,
        orderedList: false,
        listItem: false,
        link: false,
        underline: false,
      }),
      BulletList.extend({
        addInputRules() {
          return [];
        },
      }),
      OrderedList.extend({
        addInputRules() {
          return [];
        },
      }),
      ListItem,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      Image.configure({ inline: true, allowBase64: true }).extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            'data-cid': {
              default: null,
              parseHTML: element => element.getAttribute('data-cid'),
              renderHTML: attributes => {
                if (!attributes['data-cid']) {
                  return {};
                }
                return { 'data-cid': attributes['data-cid'] };
              },
            },
          };
        },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      createLinkShortcut(() => linkShortcutCallbackRef.current()),
    ],
    [placeholder] // eslint deps: createLinkShortcut is module-level (stable); linkShortcutCallbackRef is a ref (stable)
  );

  // Stable paste handler that delegates to the latest callback refs.
  // Deps are intentionally [] — both refs are stable objects; no reactive values accessed.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing: buildPasteHandler is module-level, stable
  const stablePasteHandler = useCallback(
    buildPasteHandler(
      files => onPasteFilesRef.current?.(files),
      (cid, file) => onInlineImageRef.current?.(cid, file),
      url => {
        blobUrlsRef.current.push(url);
      }
    ),
    [] // onPasteFilesRef, onInlineImageRef, and blobUrlsRef are refs (stable across renders)
  );

  // Revoke blob URLs when the editor unmounts to prevent memory leaks.
   
   
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const editor = useEditor({
    extensions,
    content: content || '',
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange(html === TAG_EMPTY_PARAGRAPH ? '' : html);
    },
    editorProps: { handlePaste: stablePasteHandler },
  });

  // Reconcile the editor against the controlled `content` prop — but never while
  // an IME or the macOS native emoji picker (Cmd+Ctrl+Space) composition is in
  // progress. Those insert via composition events, and replacing the focused
  // text node mid-composition makes ProseMirror abort the composition, so the
  // emoji is silently dropped. Guarding on `view.composing` lets the composition
  // commit; we re-sync afterwards on `compositionend`.
  const syncContentToEditor = useCallback(() => {
    if (!editor || editor.isDestroyed || editor.view?.composing) {
      return;
    }
    const currentContent = editor.getHTML();
    const newContent = content || '';
    const editorIsEmpty = currentContent === TAG_EMPTY_PARAGRAPH || currentContent === '';
    const contentIsEmpty = !newContent || newContent === TAG_EMPTY_PARAGRAPH;

    if (editorIsEmpty && contentIsEmpty) {
      return;
    }
    if (currentContent !== newContent) {
      // emitUpdate: false — a programmatic sync must not re-fire onUpdate, which
      // would loop back through onChange and re-enter this reconciliation.
      editor.commands.setContent(newContent, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    syncContentToEditor();
  }, [syncContentToEditor]);

  // The guarded sync above is skipped during composition, so the editor and the
  // `content` prop can be briefly out of sync. Reconcile once the composition
  // commits. queueMicrotask defers past ProseMirror's own composition flush.
  // Latest-ref pattern: syncContentToEditor changes on every keystroke (it
  // closes over `content`), so depending on it would re-bind the DOM listener
  // on each keystroke. Read through a ref so the effect only runs when the
  // editor itself is (re)created.
  const syncContentRef = useRef(syncContentToEditor);
  useEffect(() => {
    syncContentRef.current = syncContentToEditor;
  }, [syncContentToEditor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }
    const dom = editor.view?.dom;
    if (!dom) {
      return;
    }
    const handleCompositionEnd = () => queueMicrotask(() => syncContentRef.current());
    dom.addEventListener('compositionend', handleCompositionEnd);
    return () => dom.removeEventListener('compositionend', handleCompositionEnd);
  }, [editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  const handleInsertEmoji = useCallback(
    (emoji: string) => {
      if (editor) {
        editor.chain().focus().insertContent(emoji).run();
      }
    },
    [editor]
  );

  return (
    <div
      style={{
        border: `1px solid ${hasToneError ? theme.colors.accent.error : theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        overflow: 'visible',
        opacity: disabled ? OPACITY_DISABLED : 1,
        backgroundColor: theme.colors.background.subtle,
      }}
    >
      <RichTextToolbar
        editor={editor}
        onInsertEmoji={handleInsertEmoji}
        disabled={disabled}
        linkDialogOpen={linkDialogOpen}
        onLinkDialogChange={setLinkDialogOpen}
      />
      <EditorContent
        editor={editor}
        style={{
          minHeight,
          padding: theme.spacing.lg,
          fontSize: theme.typography.fontSize.base,
          fontFamily: theme.typography.fontFamily,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}
      />
      <style>{`
        .tiptap { outline: none; min-height: ${minHeight}; }
        .tiptap p { margin: 0 0 0.5em 0; }
        .tiptap p:last-child { margin-bottom: 0; }
        .tiptap ul,
        .tiptap ol { padding-left: 1.5em; margin: 0.5em 0; }
        .tiptap blockquote { border-left: 3px solid ${theme.colors.border.medium}; padding-left: 1em; margin: 0.5em 0; color: ${theme.colors.text.secondary}; }
        .tiptap a { color: ${theme.colors.primary.main}; text-decoration: underline; cursor: pointer; }
        .tiptap code { background-color: ${theme.colors.background.disabled}; padding: 0.15em 0.3em; border-radius: 3px; font-size: 0.9em; }
        .tiptap pre { background-color: ${theme.colors.secondary.main}; color: #fff; padding: 0.75em 1em; border-radius: ${theme.borderRadius.sm}; overflow-x: auto; margin: 0.5em 0; }
        .tiptap pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
        .tiptap img { max-width: 100%; height: auto; border-radius: 4px; margin: 0.25em 0; }
        .tiptap hr { border: none; border-top: 1px solid ${theme.colors.border.light}; margin: 1em 0; }
        .tiptap .is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: ${theme.colors.text.disabled}; pointer-events: none; height: 0; }
        .tiptap table { border-collapse: collapse; width: 100%; margin: 0.5em 0; table-layout: auto; overflow: hidden; }
        .tiptap th, .tiptap td { border: 1px solid ${theme.colors.border.medium}; padding: 4px 8px; vertical-align: top; box-sizing: border-box; position: relative; min-width: 1em; }
        .tiptap th { background-color: ${theme.colors.background.disabled}; font-weight: 600; text-align: left; }
        .tiptap .selectedCell:after { z-index: 2; position: absolute; content: ""; left: 0; right: 0; top: 0; bottom: 0; background: rgba(200, 200, 255, 0.2); pointer-events: none; }
      `}</style>
    </div>
  );
};
