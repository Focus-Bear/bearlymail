import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDealNoteMutations, useDealNotesQuery } from 'queries/dealNotes';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { OPACITY_FULL, OPACITY_HALF } from 'constants/numbers';
import { useNotifications } from 'contexts/NotificationContext';

import { DealNoteItem } from './DealNoteItem';
import { buttonRowStyle, noteTextareaStyle, primaryButtonStyle } from './dealNotes.styles';

interface DealNotesSectionProps {
  dealId: string;
}

const headingStyle: React.CSSProperties = {
  margin: `0 0 ${theme.spacing.sm}`,
  fontSize: theme.typography.fontSize.md,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.primary,
};

const hintStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.tertiary,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: `${theme.spacing.md} 0 0`,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.sm,
};

/**
 * Notes on an existing deal: add a note, then edit or delete it. Newest first,
 * each with when it was written and, if changed, when it was last edited.
 */
export const DealNotesSection: React.FC<DealNotesSectionProps> = ({ dealId }) => {
  const { t } = useTranslation();
  const { showError } = useNotifications();
  const { data: notes, isLoading, isError } = useDealNotesQuery(dealId);
  const { addNote, editNote, removeNote } = useDealNoteMutations(dealId);
  const [newNote, setNewNote] = useState('');
  const isBusy = addNote.isPending || editNote.isPending || removeNote.isPending;
  const canAdd = !isBusy && Boolean(newNote.trim());

  const handleAdd = async () => {
    try {
      await addNote.mutateAsync(newNote.trim());
      captureEvent(ANALYTICS_EVENTS.DEAL_NOTE_ADDED);
      setNewNote('');
    } catch {
      showError(t('deals.notes.saveError'));
    }
  };

  const handleSave = async (noteId: string, content: string): Promise<boolean> => {
    try {
      await editNote.mutateAsync({ noteId, content });
      captureEvent(ANALYTICS_EVENTS.DEAL_NOTE_EDITED);
      return true;
    } catch {
      showError(t('deals.notes.saveError'));
      return false;
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!window.confirm(t('deals.notes.deleteConfirm'))) {
      return;
    }
    try {
      await removeNote.mutateAsync(noteId);
      captureEvent(ANALYTICS_EVENTS.DEAL_NOTE_DELETED);
    } catch {
      showError(t('deals.notes.deleteError'));
    }
  };

  return (
    <section
      style={{
        marginTop: theme.spacing.lg,
        paddingTop: theme.spacing.lg,
        borderTop: `1px solid ${theme.colors.border.light}`,
      }}
      data-testid="deal-notes-section"
    >
      <h3 style={headingStyle}>{t('deals.notes.title')}</h3>
      <textarea
        value={newNote}
        onChange={event => setNewNote(event.target.value)}
        placeholder={t('deals.notes.placeholder')}
        aria-label={t('deals.notes.placeholder')}
        rows={2}
        style={noteTextareaStyle}
      />
      <div style={buttonRowStyle}>
        <button
          type="button"
          style={{ ...primaryButtonStyle, opacity: canAdd ? OPACITY_FULL : OPACITY_HALF }}
          disabled={!canAdd}
          onClick={handleAdd}
        >
          {t('deals.notes.add')}
        </button>
      </div>
      {isLoading && <p style={hintStyle}>{t('deals.notes.loading')}</p>}
      {isError && <p style={hintStyle}>{t('deals.notes.loadError')}</p>}
      {notes?.length === 0 && <p style={hintStyle}>{t('deals.notes.empty')}</p>}
      {notes && notes.length > 0 && (
        <ul style={listStyle}>
          {notes.map(note => (
            <DealNoteItem key={note.id} note={note} isBusy={isBusy} onSave={handleSave} onDelete={handleDelete} />
          ))}
        </ul>
      )}
    </section>
  );
};
