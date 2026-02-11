import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { theme } from 'theme/theme';
import { FONT_WEIGHT_BOLD_INLINE, FONT_WEIGHT_NORMAL_INLINE, OPACITY_HALF } from 'constants/numbers';
import { EmojiPicker } from 'components/rich-text/EmojiPicker';

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
        border: 'none',
        borderRadius: theme.borderRadius.sm,
        backgroundColor: isActive
          ? theme.colors.primary.subtle
          : isHovered
            ? theme.colors.interactive.hover
            : 'transparent',
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
          border: 'none',
          borderRadius: '2px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: 'transparent',
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
        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              marginTop: theme.spacing.xs,
            }}
          >
            <EmojiPicker
              onSelect={(emoji) => {
                onInsertEmoji(emoji);
                setShowEmojiPicker(false);
              }}
            />
          </div>
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
              if (e.key === 'Enter') {
                e.preventDefault();
                handleLinkSubmit();
              }
              if (e.key === 'Escape') {
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
              color: 'white',
              border: 'none',
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
              backgroundColor: 'transparent',
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
