import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { EditorContent, Extension,useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { theme } from 'theme/theme';

import { RichTextToolbar } from 'components/rich-text/RichTextToolbar';
import { OPACITY_DISABLED } from 'constants/numbers';
import { TAG_EMPTY_PARAGRAPH, TYPEOF_STRING } from 'constants/strings';

interface RichTextEditorProps {
  content: string | null;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hasToneError?: boolean;
  onPasteFiles?: (files: File[]) => void;
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

function buildPasteHandler(onPasteFiles?: (files: File[]) => void) {
  return (_view: any, event: ClipboardEvent): boolean => {
    const items = event.clipboardData?.items;
    if (!items) return false;
    const files: File[] = [];
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === FILE_KIND) {
        const file = item.getAsFile();
        if (file) { if (file.type.startsWith('image/')) { imageFiles.push(file); } else { files.push(file); } }
      }
    }
    if (imageFiles.length > 0) {
      event.preventDefault();
      imageFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === TYPEOF_STRING) { _view.dispatch(_view.state.tr.replaceSelectionWith(_view.state.schema.nodes.image.create({ src: result }))); }
        };
        reader.readAsDataURL(file);
      });
      return true;
    }
    if (files.length > 0 && onPasteFiles) { event.preventDefault(); onPasteFiles(files); return true; }
    return false;
  };
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ content, onChange, placeholder = '', disabled = false, hasToneError = false, onPasteFiles, minHeight = '200px' }) => {
  const isInternalUpdate = useRef(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const linkShortcutCallbackRef = useRef(() => setLinkDialogOpen(true));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3], }, bulletList: false, orderedList: false, listItem: false, }),
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
      Link.configure({ openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', }, }),
      TextAlign.configure({ types: ['heading', 'paragraph'], }),
      Placeholder.configure({ placeholder, }),
      TextStyle,
      Color,
      Image.configure({ inline: true, allowBase64: true, }),
      createLinkShortcut(() => linkShortcutCallbackRef.current()),
    ],
    content: content || '',
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      isInternalUpdate.current = true;
      const html = ed.getHTML();
      const isEmpty = ed.isEmpty;
      onChange(isEmpty ? '' : html);
    },
    editorProps: { handlePaste: buildPasteHandler(onPasteFiles) },
  });

  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentContent = editor.getHTML();
      const newContent = content || '';
      const editorIsEmpty = editor.isEmpty;
      const contentIsEmpty = !newContent || newContent === TAG_EMPTY_PARAGRAPH;

      if (editorIsEmpty && contentIsEmpty) return;
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

  const handleInsertEmoji = useCallback((emoji: string) => {
    if (editor) {
      editor.chain().focus().insertContent(emoji).run();
    }
  }, [editor]);

  return (
    <div
      style={{ border: `1px solid ${hasToneError ? theme.colors.accent.error : theme.colors.border.medium}`, borderRadius: theme.borderRadius.md, overflow: 'visible', opacity: disabled ? OPACITY_DISABLED : 1, backgroundColor: theme.colors.background.subtle, }}
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
        style={{ minHeight, padding: theme.spacing.lg, fontSize: theme.typography.fontSize.base, fontFamily: theme.typography.fontFamily, lineHeight: theme.typography.lineHeight.relaxed, }}
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
