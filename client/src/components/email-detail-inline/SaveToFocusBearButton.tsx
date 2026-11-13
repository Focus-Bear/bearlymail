import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchFocusBearTaskSuggestions,
  type FocusBearTaskSuggestions,
  useFocusBearConnectionQuery,
} from 'queries/useFocusBear';
import { theme } from 'theme/theme';
import { buildFocusBearTaskLink, type FocusBearTaskSource } from 'utils/focusBearTaskLink';
import { captureEvent } from 'utils/posthog';

import { FocusBearBrandmark } from 'components/common/FocusBearBrandmark';
import { type FocusBearTaskChoice, SaveToFocusBearPanel } from 'components/email-detail-inline/SaveToFocusBearPanel';
import { ANALYTICS_EVENTS, POSTHOG_NO_CAPTURE_CLASS } from 'constants/analytics-events';
import { OPACITY_FULL } from 'constants/numbers';

const RESTING_OPACITY = 0.75;
const BRANDMARK_SIZE_PX = 16;
const HINT_GAP_PX = 4;

interface SaveToFocusBearButtonProps {
  taskTitle: string;
  source: FocusBearTaskSource;
}

function brandmarkButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
    background: 'transparent',
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    opacity: isActive ? OPACITY_FULL : RESTING_OPACITY,
    transition: theme.transitions.default,
  };
}

// Left of the brandmark and vertically centred on it, so it stays inside the action-items card, which clips overflow.
const hintStyle: React.CSSProperties = {
  position: 'absolute',
  right: `calc(100% + ${HINT_GAP_PX}px)`,
  top: '50%',
  transform: 'translateY(-50%)',
  whiteSpace: 'nowrap',
  padding: `2px ${theme.spacing.sm}`,
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.medium,
  color: theme.colors.text.inverse,
  backgroundColor: theme.colors.text.primary,
  borderRadius: theme.borderRadius.sm,
  boxShadow: theme.shadows.sm,
  pointerEvents: 'none',
};

/** Focus Bear's suggestions for one task, fetched on demand and only with a connection. */
function useFocusBearTaskSuggestions(taskTitle: string, source: FocusBearTaskSource) {
  const queryClient = useQueryClient();
  const { data: connection } = useFocusBearConnectionQuery();
  const isConnected = connection?.connected === true;
  const [suggestions, setSuggestions] = useState<FocusBearTaskSuggestions | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadSuggestions = useCallback(async () => {
    if (!isConnected || suggestions) {
      return;
    }
    setIsLoading(true);
    try {
      setSuggestions(
        await fetchFocusBearTaskSuggestions(queryClient, {
          title: taskTitle,
          emailSubject: source.emailSubject,
          sender: source.sender,
        })
      );
    } catch {
      // Without suggestions the panel still saves; the project is simply left to the user.
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, suggestions, queryClient, taskTitle, source]);

  return { isConnected, suggestions, isLoading, loadSuggestions };
}

function recordSave(choice: FocusBearTaskChoice, suggestions: FocusBearTaskSuggestions | null) {
  captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_SAVED_TO_FOCUS_BEAR, {
    hasProject: Boolean(choice.projectId),
    hasDueDate: Boolean(choice.dueDate),
    hasDuration: Boolean(choice.durationMinutes),
    projectSuggested: Boolean(choice.projectId) && choice.projectId === suggestions?.project?.id,
    dueDateNextFree: !choice.dueDate,
  });
}

/**
 * The Focus Bear brandmark on an action item. Hovering or focusing it says "Save task in Focus Bear";
 * clicking it opens a panel that asks for the due date and duration (and, with Focus Bear connected,
 * the project) before handing the task to the Focus Bear desktop app through its
 * `focusbear://create-task` link, so the browser's own "Open Focus Bear?" prompt applies.
 */
export const SaveToFocusBearButton: React.FC<SaveToFocusBearButtonProps> = ({ taskTitle, source }) => {
  const { t } = useTranslation();
  const { isConnected, suggestions, isLoading, loadSuggestions } = useFocusBearTaskSuggestions(taskTitle, source);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isHinting, setIsHinting] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const label = t('emailDetail.saveTaskInFocusBear');

  const closePanel = useCallback((shouldRestoreFocus: boolean) => {
    setIsPanelOpen(false);
    if (shouldRestoreFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  const showHintAndPrefetch = () => {
    setIsHinting(true);
    void loadSuggestions();
  };

  const togglePanel = () => {
    void loadSuggestions();
    setIsPanelOpen(open => !open);
  };

  const save = (choice: FocusBearTaskChoice) => {
    recordSave(choice, suggestions);
    window.location.assign(
      buildFocusBearTaskLink({
        title: taskTitle,
        notes: t('emailDetail.focusBearTaskNotes', { sender: source.sender, subject: source.emailSubject }),
        link: source.emailUrl,
        ...choice,
      })
    );
    closePanel(true);
  };

  return (
    <span
      className={POSTHOG_NO_CAPTURE_CLASS}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isPanelOpen}
        onClick={togglePanel}
        onMouseEnter={showHintAndPrefetch}
        onMouseLeave={() => setIsHinting(false)}
        onFocus={showHintAndPrefetch}
        onBlur={() => setIsHinting(false)}
        style={brandmarkButtonStyle(isHinting || isPanelOpen)}
      >
        <FocusBearBrandmark size={BRANDMARK_SIZE_PX} />
      </button>
      {isHinting && !isPanelOpen && (
        // The button's own name already says this; the hint is for sighted pointer and keyboard users.
        <span aria-hidden="true" style={hintStyle}>
          {label}
        </span>
      )}
      {isPanelOpen && buttonRef.current && (
        <SaveToFocusBearPanel
          anchor={buttonRef.current}
          taskTitle={taskTitle}
          isConnected={isConnected}
          suggestions={suggestions}
          isLoading={isLoading}
          onSave={save}
          onClose={closePanel}
        />
      )}
    </span>
  );
};
