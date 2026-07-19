import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor, useEditor } from '@tiptap/react';
import { theme } from 'theme/theme';

import { EmojiPickerPortal } from 'components/rich-text/EmojiPickerPortal';
import { useLinkInputState } from 'components/rich-text/useLinkInputState';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { ICON_CLEAR_FORMATTING } from 'constants/emojis';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

import { ToolbarButton, ToolbarDivider } from './ToolbarButtonGroup';
import { useToolbarHandlers } from './useToolbarHandlers';

interface RichTextToolbarProps {
  editor: Editor | null;
  onInsertEmoji: (emoji: string) => void;
  disabled?: boolean;
  linkDialogOpen?: boolean;
  onLinkDialogChange?: (open: boolean) => void;
}

type EditorLike = NonNullable<ReturnType<typeof useEditor>>;

interface ToolbarSectionProps {
  editor: EditorLike;
  handlers: ReturnType<typeof useToolbarHandlers>;
  disabled: boolean;
}
interface LinkPopupProps extends ToolbarSectionProps {
  showLinkInput: boolean;
  linkUrl: string;
  linkInputRef: React.RefObject<HTMLInputElement | null>;
  setLinkUrl: (v: string) => void;
  setShowLinkInput: (v: boolean) => void;
  handleLinkSubmit: () => void;
  t: (tKey: string) => string;
}

const ToolbarFormattingSection: React.FC<ToolbarSectionProps> = ({ editor, handlers, disabled }) => {
  const { t } = useTranslation();
  return (
  <>
    <ToolbarButton
      onClick={handlers.toggleBold}
      isActive={editor.isActive('bold')}
      disabled={disabled}
      title={t('compose.toolbar.bold')}
    >
      <strong>B</strong>
    </ToolbarButton>
    <ToolbarButton
      onClick={handlers.toggleItalic}
      isActive={editor.isActive('italic')}
      disabled={disabled}
      title={t('compose.toolbar.italic')}
    >
      <em>I</em>
    </ToolbarButton>
    <ToolbarButton
      onClick={handlers.toggleUnderline}
      isActive={editor.isActive('underline')}
      disabled={disabled}
      title={t('compose.toolbar.underline')}
    >
      <span style={{ textDecoration: 'underline' }}>U</span>
    </ToolbarButton>
    <ToolbarButton
      onClick={handlers.toggleStrike}
      isActive={editor.isActive('strike')}
      disabled={disabled}
      title={t('compose.toolbar.strikethrough')}
    >
      <span style={{ textDecoration: 'line-through' }}>S</span>
    </ToolbarButton>
    <ToolbarDivider />
    <ToolbarButton onClick={handlers.unsetColor} disabled={disabled} title={t('compose.toolbar.textColor')}>
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
      onChange={event => handlers.setColor(event.target.value)}
      value={editor.getAttributes('textStyle').color || '#000000'}
      disabled={disabled}
      title={t('compose.toolbar.pickTextColor')}
      style={{
        width: '20px',
        height: '20px',
        padding: 0,
        border: 'none',
        borderRadius: '2px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: COLOR_TRANSPARENT,
      }}
    />
    <ToolbarDivider />
    <ToolbarButton
      onClick={handlers.toggleBulletList}
      isActive={editor.isActive('bulletList')}
      disabled={disabled}
      title={t('compose.toolbar.bulletList')}
    >
      <span style={{ fontSize: '16px', lineHeight: 1 }}>•≡</span>
    </ToolbarButton>
    <ToolbarButton
      onClick={handlers.toggleOrderedList}
      isActive={editor.isActive('orderedList')}
      disabled={disabled}
      title={t('compose.toolbar.numberedList')}
    >
      <span style={{ fontSize: '12px', lineHeight: 1 }}>1.</span>
    </ToolbarButton>
    <ToolbarDivider />
  </>
  );
};

const ToolbarAlignSection: React.FC<ToolbarSectionProps> = ({ editor, handlers, disabled }) => {
  const { t } = useTranslation();
  return (
  <>
    <ToolbarButton
      onClick={() => handlers.setTextAlign('left')}
      isActive={editor.isActive({ textAlign: 'left' })}
      disabled={disabled}
      title={t('compose.toolbar.alignLeft')}
    >
      <span style={{ fontSize: '11px', lineHeight: 1 }}>≡</span>
    </ToolbarButton>
    <ToolbarButton
      onClick={() => handlers.setTextAlign('center')}
      isActive={editor.isActive({ textAlign: 'center' })}
      disabled={disabled}
      title={t('compose.toolbar.alignCenter')}
    >
      <span style={{ fontSize: '11px', lineHeight: 1 }}>≡</span>
    </ToolbarButton>
    <ToolbarButton
      onClick={() => handlers.setTextAlign('right')}
      isActive={editor.isActive({ textAlign: 'right' })}
      disabled={disabled}
      title={t('compose.toolbar.alignRight')}
    >
      <span style={{ fontSize: '11px', lineHeight: 1 }}>≡</span>
    </ToolbarButton>
    <ToolbarDivider />
    <ToolbarButton
      onClick={handlers.toggleBlockquote}
      isActive={editor.isActive('blockquote')}
      disabled={disabled}
      title={t('compose.toolbar.quote')}
    >
      <span style={{ fontSize: '16px', lineHeight: 1, fontFamily: 'Georgia, serif' }}>"</span>
    </ToolbarButton>
    <ToolbarButton
      onClick={handlers.toggleCodeBlock}
      isActive={editor.isActive('codeBlock')}
      disabled={disabled}
      title={t('compose.toolbar.codeBlock')}
    >
      <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>&lt;/&gt;</span>
    </ToolbarButton>
    <ToolbarButton onClick={handlers.setHorizontalRule} disabled={disabled} title={t('compose.toolbar.horizontalRule')}>
      —
    </ToolbarButton>
    <ToolbarDivider />
  </>
  );
};

const LinkPopup: React.FC<LinkPopupProps> = ({
  showLinkInput,
  linkUrl,
  linkInputRef,
  setLinkUrl,
  setShowLinkInput,
  handleLinkSubmit,
  t,
}) => {
  if (!showLinkInput) {
    return null;
  }
  return (
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
        onChange={event => setLinkUrl(event.target.value)}
        onKeyDown={event => {
          if (event.key === KEY_ENTER) {
            event.preventDefault();
            handleLinkSubmit();
          }
          if (event.key === KEY_ESCAPE) {
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
        {t('common.cancel')}
      </button>
    </div>
  );
};

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  editor,
  onInsertEmoji,
  disabled = false,
  linkDialogOpen = false,
  onLinkDialogChange,
}) => {
  const { t } = useTranslation();

  const { showLinkInput, setShowLinkInput, linkUrl, setLinkUrl, linkInputRef, handleLinkSubmit, handleToggleLink } =
    useLinkInputState({ editor, linkDialogOpen, onLinkDialogChange });

  const handlers = useToolbarHandlers(editor);

  useEffect(() => {
    // noop here — tooltip/portal behavior moved into EmojiPickerPortal
    return undefined;
  }, []);

  if (!editor) {
    return null;
  }

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
      <ToolbarFormattingSection editor={editor} handlers={handlers} disabled={disabled} />
      <ToolbarAlignSection editor={editor} handlers={handlers} disabled={disabled} />
      <ToolbarButton
        onClick={handleToggleLink}
        isActive={editor.isActive('link')}
        disabled={disabled}
        title={t('compose.toolbar.insertLink')}
      >
        <span style={{ fontSize: '13px' }}>🔗</span>
      </ToolbarButton>
      <EmojiPickerPortal
        onSelect={emoji => {
          onInsertEmoji(emoji);
        }}
        disabled={disabled}
      />
      <ToolbarDivider />
      <ToolbarButton onClick={handlers.undo} disabled={disabled || !handlers.canUndo()} title={t('compose.toolbar.undo')}>
        ↩
      </ToolbarButton>
      <ToolbarButton onClick={handlers.redo} disabled={disabled || !handlers.canRedo()} title={t('compose.toolbar.redo')}>
        ↪
      </ToolbarButton>
      <ToolbarButton onClick={handlers.clearFormatting} disabled={disabled} title={t('compose.toolbar.clearFormatting')}>
        <span style={{ fontSize: '11px' }}>{ICON_CLEAR_FORMATTING}</span>
      </ToolbarButton>
      <LinkPopup
        showLinkInput={showLinkInput}
        linkUrl={linkUrl}
        linkInputRef={linkInputRef}
        setLinkUrl={setLinkUrl}
        setShowLinkInput={setShowLinkInput}
        handleLinkSubmit={handleLinkSubmit}
        t={t}
        editor={editor}
        handlers={handlers}
        disabled={disabled}
      />
    </div>
  );
};
