import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';
import { MS_PER_SECOND, SECONDS_PER_MINUTE, MINUTES_PER_HOUR } from 'constants/numbers';

const DEBOUNCE_MS = 1000;
const SAVED_STATUS_UPDATE_INTERVAL_MS = 10000;

function humanizeDuration(ms: number): string {
  const seconds = Math.floor(ms / MS_PER_SECOND);
  if (seconds < 5) return 'just now';
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m ago`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return `${hours}h ago`;
}

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
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);
  const previousContentRef = useRef(noteContent);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    isInitialLoadRef.current = true;
    previousContentRef.current = noteContent;
  }, []);

  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      previousContentRef.current = noteContent;
      return;
    }
    if (noteContent === previousContentRef.current) return;
    previousContentRef.current = noteContent;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      captureEvent('private_note_auto_saved');
      onSaveNote();
      setLastSavedAt(Date.now());
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [noteContent, onSaveNote]);

  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = setInterval(() => {
      forceUpdate(n => n + 1);
    }, SAVED_STATUS_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

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
              marginBottom: theme.spacing.sm,
              resize: 'vertical',
            }}
          />
          {/* eslint-disable i18next/no-literal-string */}
          {lastSavedAt && (
            <div style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.tertiary,
              textAlign: 'right',
            }}>
              Automatically saved {humanizeDuration(Date.now() - lastSavedAt)}
            </div>
          )}
          {/* eslint-enable i18next/no-literal-string */}
        </div>
      )}
    </div>
  );
};






