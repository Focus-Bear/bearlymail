import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BulletList from '@tiptap/extension-bullet-list';
import Color from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import ListItem from '@tiptap/extension-list-item';
import OrderedList from '@tiptap/extension-ordered-list';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { EditorView } from '@tiptap/pm/view';
import { EditorContent, Extension, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { theme } from 'theme/theme';

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

function buildPasteHandler(
  onPasteFiles?: (files: File[]) => void,
  onInlineImage?: (cid: string, file: File) => void,
  trackBlobUrl?: (url: string) => void,
) {
  return (_view: EditorView, event: ClipboardEvent): boolean => {
    const items = event.clipboardData?.items;
    if (!items) {
      return false;
    }
    const nonImageFiles: File[] = [];
    const imageFiles: File[] = [];
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
          _view.state.tr.replaceSelectionWith(
            _view.state.schema.nodes.image.create({ src: blobUrl, 'data-cid': cid }),
          ),
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
  const isInternalUpdate = useRef(false);
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
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, bulletList: false, orderedList: false, listItem: false, link: false, underline: false }),
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
      createLinkShortcut(() => linkShortcutCallbackRef.current()),
    ],
    [placeholder], // eslint deps: createLinkShortcut is module-level (stable); linkShortcutCallbackRef is a ref (stable)
  );

  // Stable paste handler that delegates to the latest callback refs.
  // Deps are intentionally [] — both refs are stable objects; no reactive values accessed.
  const stablePasteHandler = useCallback(
    buildPasteHandler(
      (files) => onPasteFilesRef.current?.(files),
      (cid, file) => onInlineImageRef.current?.(cid, file),
      (url) => {
        blobUrlsRef.current.push(url);
      },
    ),
    [], // onPasteFilesRef, onInlineImageRef, and blobUrlsRef are refs (stable across renders)
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
      isInternalUpdate.current = true;
      const html = ed.getHTML();
      const isEmpty = ed.isEmpty;
      onChange(isEmpty ? '' : html);
    },
    editorProps: { handlePaste: stablePasteHandler },
  });

  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentContent = editor.getHTML();
      const newContent = content || '';
      const editorIsEmpty = editor.isEmpty;
      const contentIsEmpty = !newContent || newContent === TAG_EMPTY_PARAGRAPH;

      if (editorIsEmpty && contentIsEmpty) {
        return;
      }
      if (currentContent !== newContent) {
        editor.commands.setContent(newContent);
      }
    }
    isInternalUpdate.current = false;
  }, [content, editor]);

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
      `}</style>
    </div>
  );
};
