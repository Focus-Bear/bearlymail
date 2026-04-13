import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFileText } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { NOTES_PREVIEW_MAX_CHARS } from 'constants/numbers';

import { humanizeDuration } from './privateNotes.helpers';

const DEBOUNCE_MS = 1000;
const SAVED_STATUS_UPDATE_INTERVAL_MS = 10000;

interface PrivateNotesSectionProps {
  noteContent: string;
  notesCollapsed: boolean;
  onNoteContentChange: (content: string) => void;
  onToggleCollapsed: () => void;
  onSaveNote: () => void;
  /** When provided, shows a dismiss (X) button on the card header. */
  onDismiss?: () => void;
}

export const PrivateNotesSection: React.FC<PrivateNotesSectionProps> = ({
  noteContent,
  notesCollapsed,
  onNoteContentChange,
  onToggleCollapsed,
  onSaveNote,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);
  const previousContentRef = useRef(noteContent);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    isInitialLoadRef.current = true;
  }, []);

  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      previousContentRef.current = noteContent;
      return;
    }
    if (noteContent === previousContentRef.current) {
      return;
    }
    previousContentRef.current = noteContent;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      captureEvent(ANALYTICS_EVENTS.PRIVATE_NOTE_AUTO_SAVED);
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
    if (!lastSavedAt) {
      return;
    }
    const interval = setInterval(() => {
      forceUpdate(prev => prev + 1);
    }, SAVED_STATUS_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  const preview = noteContent
    ? noteContent.slice(0, NOTES_PREVIEW_MAX_CHARS) + (noteContent.length > NOTES_PREVIEW_MAX_CHARS ? '…' : '')
    : t('emailDetail.privateNotesPlaceholder');

  return (
    <CollapsibleSection
      icon={<FiFileText size={18} />}
      title={t('emailDetail.privateNotes')}
      isCollapsed={notesCollapsed}
      onToggle={() => {
        captureEvent(ANALYTICS_EVENTS.PRIVATE_NOTES_TOGGLED, { collapsed: !notesCollapsed });
        onToggleCollapsed();
      }}
      accentColor={theme.colors.section.notes.accent}
      backgroundColor={theme.colors.section.notes.background}
      preview={preview}
      onDismiss={onDismiss}
      dismissTitle={t('emailDetail.hideCard')}
    >
      <textarea
        value={noteContent}
        onChange={event => onNoteContentChange(event.target.value)}
        placeholder={t('emailDetail.privateNotesPlaceholder')}
        style={{
          width: '100%',
          minHeight: '100px',
          padding: theme.spacing.md,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.base,
          fontFamily: theme.typography.fontFamily,
          resize: 'vertical',
          boxSizing: 'border-box',
          backgroundColor: COLOR_NAMED_WHITE,
        }}
      />
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.tertiary,
          marginTop: theme.spacing.xs,
        }}
      >
        {lastSavedAt
          ? t('emailDetail.onlyVisibleToYouSaved', { duration: humanizeDuration(Date.now() - lastSavedAt) })
          : t('emailDetail.onlyVisibleToYou')}
      </div>
    </CollapsibleSection>
  );
};
