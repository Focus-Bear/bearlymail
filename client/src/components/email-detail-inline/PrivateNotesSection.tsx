import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

interface PrivateNotesSectionProps {
  noteContent: string;
  notesCollapsed: boolean;
  onNoteContentChange: (content: string) => void;
  onToggleCollapsed: () => void;
  onSaveNote: () => void;
}

export const PrivateNotesSection: React.FC<PrivateNotesSectionProps> = ({
  noteContent,
  notesCollapsed,
  onNoteContentChange,
  onToggleCollapsed,
  onSaveNote,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.lg,
      boxShadow: theme.shadows.sm,
      marginBottom: theme.spacing.md,
      border: `1px solid ${theme.colors.border.light}`,
    }}>
      <div 
        onClick={() => {
          captureEvent('private_notes_toggled', { collapsed: !notesCollapsed });
          onToggleCollapsed();
        }}
        style={{
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <h3 style={{
          color: theme.colors.text.primary,
          margin: 0,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}>
          📝 {t('emailDetail.privateNotes')}
        </h3>
        <span style={{ color: theme.colors.text.secondary }}>
          {notesCollapsed ? '▼' : '▲'}
        </span>
      </div>
      
      {!notesCollapsed && (
        <div className="animate-fade-in" style={{ marginTop: theme.spacing.md }}>
          <textarea
            value={noteContent}
            onChange={(e) => onNoteContentChange(e.target.value)}
            placeholder={t('emailDetail.privateNotesPlaceholder')}
            style={{
              width: '100%',
              minHeight: '100px',
              padding: theme.spacing.md,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              fontFamily: theme.typography.fontFamily,
              marginBottom: theme.spacing.md,
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              data-save-note-button
              onClick={() => {
                captureEvent('private_note_saved');
                onSaveNote();
              }}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {t('emailDetail.saveNote')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};






