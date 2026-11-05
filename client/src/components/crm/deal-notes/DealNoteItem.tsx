import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { DealNote } from 'types/deal';
import { humanizeTimestamp } from 'utils/dateUtils';

import { OPACITY_FULL, OPACITY_HALF } from 'constants/numbers';

import { buttonRowStyle, linkButtonStyle, noteTextareaStyle, primaryButtonStyle } from './dealNotes.styles';

interface DealNoteItemProps {
  note: DealNote;
  isBusy: boolean;
  /** Resolves true once saved; on false the editor stays open with the draft. */
  onSave: (noteId: string, content: string) => Promise<boolean>;
  onDelete: (noteId: string) => void;
}

const itemStyle: React.CSSProperties = {
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  backgroundColor: theme.colors.background.default,
};

const metaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  marginTop: theme.spacing.xs,
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.tertiary,
};

const wasEdited = (note: DealNote) => note.updatedAt !== note.createdAt;

/** One deal note: its text and timestamps, with inline edit and delete. */
export const DealNoteItem: React.FC<DealNoteItemProps> = ({ note, isBusy, onSave, onDelete }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const isEditing = draft !== null;
  const canSave = !isBusy && Boolean(draft?.trim());

  const handleSave = async () => {
    if (!draft?.trim()) {
      return;
    }
    if (await onSave(note.id, draft.trim())) {
      setDraft(null);
    }
  };

  if (isEditing) {
    return (
      <li style={itemStyle} data-testid="deal-note-item">
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          rows={3}
          style={noteTextareaStyle}
          aria-label={t('deals.notes.editLabel')}
          autoFocus
        />
        <div style={buttonRowStyle}>
          <button type="button" style={linkButtonStyle} onClick={() => setDraft(null)}>
            {t('deals.cancel')}
          </button>
          <button
            type="button"
            style={{ ...primaryButtonStyle, opacity: canSave ? OPACITY_FULL : OPACITY_HALF }}
            disabled={!canSave}
            onClick={handleSave}
          >
            {t('deals.save')}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li style={itemStyle} data-testid="deal-note-item">
      <div style={{ whiteSpace: 'pre-wrap', fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>
        {note.content}
      </div>
      <div style={metaStyle}>
        <span title={new Date(note.createdAt).toLocaleString()}>
          {humanizeTimestamp(note.createdAt, { showAbsoluteDate: true })}
        </span>
        {wasEdited(note) && (
          <span title={new Date(note.updatedAt).toLocaleString()}>
            {t('deals.notes.edited', { time: humanizeTimestamp(note.updatedAt) })}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: theme.spacing.sm }}>
          <button type="button" style={linkButtonStyle} disabled={isBusy} onClick={() => setDraft(note.content)}>
            {t('deals.notes.edit')}
          </button>
          <button type="button" style={linkButtonStyle} disabled={isBusy} onClick={() => onDelete(note.id)}>
            {t('deals.delete')}
          </button>
        </span>
      </div>
    </li>
  );
};
