import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Editor } from '@tiptap/react';
import { createPortal } from 'react-dom';
import { theme } from 'theme/theme';

import { FONT_WEIGHT_BOLD_INLINE, FONT_WEIGHT_NORMAL_INLINE, OPACITY_HALF, Z_INDEX_POPUP } from 'constants/numbers';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

import { EmojiPicker } from 'components/rich-text/EmojiPicker';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';

interface RichTextToolbarProps {
  editor: Editor | null;
  onInsertEmoji: (emoji: string) => void;
  disabled?: boolean;
  linkDialogOpen?: boolean;
  onLinkDialogChange?: (open: boolean) => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        padding: 0,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.sm,
        backgroundColor: (() => {
          if (isActive) return theme.colors.primary.subtle;
          if (isHovered) return theme.colors.interactive.hover;
          return 'transparent';
        })(),
        color: isActive ? theme.colors.primary.main : theme.colors.text.secondary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: isActive ? FONT_WEIGHT_BOLD_INLINE : FONT_WEIGHT_NORMAL_INLINE,
        transition: theme.transitions.fast,
        opacity: disabled ? OPACITY_HALF : 1,
      }}
    >
      {children}
    </button>
  );
};

const ToolbarDivider: React.FC = () => (
  <div
    style={{
      width: '1px',
      height: '20px',
      backgroundColor: theme.colors.border.light,
      margin: `0 ${theme.spacing.xs}`,
    }}
  />
);

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  editor,
  onInsertEmoji,
  disabled = false,
  linkDialogOpen = false,
  onLinkDialogChange,
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ top: number; left: number } | null>(null);

  const updateEmojiPickerPosition = useCallback(() => {
    if (!emojiButtonRef.current) return;

    const triggerRect = emojiButtonRef.current.getBoundingClientRect();
    const pickerRect = emojiPickerRef.current?.getBoundingClientRect();

    const viewportPadding = 12;
    const pickerOffset = 8;
    const fallbackPickerWidth = 352;
    const fallbackPickerHeight = 435;
    const pickerWidth = pickerRect?.width || fallbackPickerWidth;
    const pickerHeight = pickerRect?.height || fallbackPickerHeight;
    const availableBottomSpace = window.innerHeight - triggerRect.bottom;
    const shouldOpenAbove = availableBottomSpace < pickerHeight + pickerOffset;

    const maxLeft = Math.max(viewportPadding, window.innerWidth - pickerWidth - viewportPadding);
    const nextLeft = Math.max(viewportPadding, Math.min(triggerRect.right - pickerWidth, maxLeft));
    const preferredTop = shouldOpenAbove ? triggerRect.top - pickerHeight - pickerOffset : triggerRect.bottom + pickerOffset;
    const maxTop = Math.max(viewportPadding, window.innerHeight - pickerHeight - viewportPadding);
    const nextTop = Math.max(viewportPadding, Math.min(preferredTop, maxTop));

    setEmojiPickerPosition((previousPosition) => {
      if (previousPosition?.top === nextTop && previousPosition?.left === nextLeft) {
        return previousPosition;
      }
      return { top: nextTop, left: nextLeft };
    });
  }, []);

  useEffect(() => {
    if (linkDialogOpen && !showLinkInput) {
      if (!editor) return;
      if (editor.isActive('link')) {
        editor.chain().focus().unsetLink().run();
      } else {
        const previousUrl = editor.getAttributes('link').href || '';
        setLinkUrl(previousUrl);
        setShowLinkInput(true);
      }
      onLinkDialogChange?.(false);
    }
  }, [linkDialogOpen, showLinkInput, editor, onLinkDialogChange]);

  useEffect(() => {
    if (showLinkInput && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [showLinkInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showEmojiPicker &&
        emojiPickerRef.current &&
        emojiButtonRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        !emojiButtonRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  useLayoutEffect(() => {
    if (!showEmojiPicker) {
      setEmojiPickerPosition(null);
      return;
    }

    updateEmojiPickerPosition();
    const animationFrameId = window.requestAnimationFrame(updateEmojiPickerPosition);

    window.addEventListener('resize', updateEmojiPickerPosition);
    window.addEventListener('scroll', updateEmojiPickerPosition, true);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateEmojiPickerPosition);
      window.removeEventListener('scroll', updateEmojiPickerPosition, true);
    };
  }, [showEmojiPicker, updateEmojiPickerPosition]);

  const handleLinkSubmit = useCallback(() => {
    if (!editor || !linkUrl) return;
    let url = linkUrl.trim();
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkUrl('');
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  const handleToggleLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setShowLinkInput(true);
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '2px',
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.paper,
        position: 'relative',
      }}
    >
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        disabled={disabled}
        title="Bold (Cmd+B)"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        disabled={disabled}
        title="Italic (Cmd+I)"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        disabled={disabled}
        title="Underline (Cmd+U)"
      >
        <span style={{ textDecoration: 'underline' }}>U</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        disabled={disabled}
        title="Strikethrough (Cmd+Shift+S)"
      >
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Text color */}
      <ToolbarButton
        onClick={() => {
          const currentColor = editor.getAttributes('textStyle').color;
          if (currentColor) {
            editor.chain().focus().unsetColor().run();
          }
        }}
        disabled={disabled}
        title="Text color"
      >
        <span style={{ position: 'relative' }}>
          A
          <span
            style={{
              position: 'absolute',
              bottom: '-2px',
              left: 0,
              right: 0,
              height: '3px',
              backgroundColor: editor.getAttributes('textStyle').color || theme.colors.text.primary,
              borderRadius: '1px',
            }}
          />
        </span>
      </ToolbarButton>
      <input
        type="color"
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        value={editor.getAttributes('textStyle').color || '#000000'}
        disabled={disabled}
        title="Pick text color"
        style={{
          width: '20px',
          height: '20px',
          padding: 0,
          border: STRING_NONE,
          borderRadius: '2px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: COLOR_TRANSPARENT,
        }}
      />

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        disabled={disabled}
        title="Bullet list"
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '16px', lineHeight: 1 }}>•≡</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        disabled={disabled}
        title="Numbered list"
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '12px', lineHeight: 1 }}>1.</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        isActive={editor.isActive({ textAlign: 'left' })}
        disabled={disabled}
        title="Align left"
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '11px', lineHeight: 1 }}>≡</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        isActive={editor.isActive({ textAlign: 'center' })}
        disabled={disabled}
        title="Align center"
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '11px', lineHeight: 1 }}>≡</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        isActive={editor.isActive({ textAlign: 'right' })}
        disabled={disabled}
        title="Align right"
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '11px', lineHeight: 1 }}>≡</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        disabled={disabled}
        title="Quote"
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '16px', lineHeight: 1, fontFamily: 'Georgia, serif' }}>"</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        disabled={disabled}
        title="Code block"
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>&lt;/&gt;</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        disabled={disabled}
        title="Horizontal rule"
      >
        —
      </ToolbarButton>

      <ToolbarDivider />

      {/* Link */}
      <ToolbarButton
        onClick={handleToggleLink}
        isActive={editor.isActive('link')}
        disabled={disabled}
        title="Insert link (Cmd+K)"
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '13px' }}>🔗</span>
      </ToolbarButton>

      {/* Emoji */}
      <div ref={emojiButtonRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <ToolbarButton
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          isActive={showEmojiPicker}
          disabled={disabled}
          title="Insert emoji"
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span style={{ fontSize: '14px' }}>😊</span>
        </ToolbarButton>
        {showEmojiPicker &&
          createPortal(
            <div
              ref={emojiPickerRef}
              style={{
                position: 'fixed',
                top: `${emojiPickerPosition?.top ?? 0}px`,
                left: `${emojiPickerPosition?.left ?? 0}px`,
                zIndex: Z_INDEX_POPUP,
                visibility: emojiPickerPosition ? 'visible' : 'hidden',
              }}
            >
              <EmojiPicker
                onSelect={(emoji) => {
                  onInsertEmoji(emoji);
                  setShowEmojiPicker(false);
                }}
              />
            </div>,
            document.body,
          )}
      </div>

      <ToolbarDivider />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={disabled || !editor.can().undo()}
        title="Undo (Cmd+Z)"
      >
        ↩
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={disabled || !editor.can().redo()}
        title="Redo (Cmd+Shift+Z)"
      >
        ↪
      </ToolbarButton>

      {/* Remove formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        disabled={disabled}
        title="Clear formatting"
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: '11px' }}>T̶ₓ</span>
      </ToolbarButton>

      {/* Link URL input popup */}
      {showLinkInput && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: theme.spacing.sm,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            boxShadow: theme.shadows.md,
          }}
        >
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === KEY_ENTER) {
                e.preventDefault();
                handleLinkSubmit();
              }
              if (e.key === KEY_ESCAPE) {
                setShowLinkInput(false);
              }
            }}
            placeholder="https://example.com"
            style={{
              width: '250px',
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.sm,
              outline: 'none',
            }}
          />
          {/* eslint-disable i18next/no-literal-string */}
          <button
            type="button"
            onClick={handleLinkSubmit}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setShowLinkInput(false)}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            Cancel
          </button>
          {/* eslint-enable i18next/no-literal-string */}
        </div>
      )}
    </div>
  );
};
