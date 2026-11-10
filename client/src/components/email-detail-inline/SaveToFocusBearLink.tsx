import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown } from 'react-icons/fi';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchFocusBearTaskSuggestions,
  type FocusBearTaskSuggestions,
  useFocusBearConnectionQuery,
} from 'queries/useFocusBear';
import { theme } from 'theme/theme';
import { buildFocusBearTaskLink, type FocusBearTaskSource } from 'utils/focusBearTaskLink';
import { captureEvent } from 'utils/posthog';

import { type FocusBearTaskChoice, SaveToFocusBearPanel } from 'components/email-detail-inline/SaveToFocusBearPanel';
import { ANALYTICS_EVENTS, POSTHOG_NO_CAPTURE_CLASS } from 'constants/analytics-events';
import { EMOJI_FOCUS_BEAR } from 'constants/emojis';
import { FOCUS_BEAR_QUICK_SAVE_WAIT_MS } from 'constants/focusBear';

const RESTING_OPACITY = '0.6';
const ACTIVE_OPACITY = '1';
const CHEVRON_SIZE = 12;

interface SaveToFocusBearLinkProps {
  taskTitle: string;
  source: FocusBearTaskSource;
}

function setOpacity(event: React.SyntheticEvent<HTMLElement>, opacity: string) {
  event.currentTarget.style.opacity = opacity;
}

/** The choice Focus Bear suggests: what a quick save uses as it is. */
function suggestedChoice(suggestions: FocusBearTaskSuggestions | null): FocusBearTaskChoice {
  return { projectId: suggestions?.project?.id, dueDate: suggestions?.dueDate ?? undefined };
}

function waitAtMost<T>(promise: Promise<T>, milliseconds: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>(resolve => setTimeout(() => resolve(null), milliseconds))]);
}

const quickSaveLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '2px',
  fontSize: theme.typography.fontSize.sm,
  lineHeight: 1,
  textDecoration: 'none',
  borderRadius: theme.borderRadius.sm,
  opacity: RESTING_OPACITY,
};

const panelToggleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '2px 0',
  background: 'transparent',
  border: 'none',
  color: theme.colors.text.tertiary,
  cursor: 'pointer',
};

/** Focus Bear's suggestions for one task, fetched on demand and only with a connection. */
function useFocusBearTaskSuggestions(taskTitle: string, source: FocusBearTaskSource) {
  const queryClient = useQueryClient();
  const { data: connection } = useFocusBearConnectionQuery();
  const isConnected = connection?.connected === true;
  const [suggestions, setSuggestions] = useState<FocusBearTaskSuggestions | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadSuggestions = useCallback(async (): Promise<FocusBearTaskSuggestions | null> => {
    if (!isConnected) {
      return null;
    }
    setIsLoading(true);
    try {
      const loaded = await fetchFocusBearTaskSuggestions(queryClient, {
        title: taskTitle,
        emailSubject: source.emailSubject,
        sender: source.sender,
      });
      setSuggestions(loaded);
      return loaded;
    } catch {
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, queryClient, taskTitle, source]);

  return { isConnected, suggestions, isLoading, loadSuggestions };
}

function recordSave(choice: FocusBearTaskChoice, isFromPanel: boolean, suggested: FocusBearTaskChoice) {
  captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_SAVED_TO_FOCUS_BEAR, {
    fromPanel: isFromPanel,
    hasProject: Boolean(choice.projectId),
    hasDueDate: Boolean(choice.dueDate),
    projectSuggested: Boolean(choice.projectId) && choice.projectId === suggested.projectId,
    dueDateSuggested: Boolean(choice.dueDate) && choice.dueDate === suggested.dueDate,
  });
}

/**
 * Hands an action item to the Focus Bear desktop app through its
 * `focusbear://create-task` link. With Focus Bear connected, the task carries the
 * project and due date Focus Bear suggests: the 🐻 saves with them as they are,
 * the arrow opens a panel that shows them, marked "Suggested", for the user to
 * change first. Plain links rather than buttons, so the browser's own "Open Focus
 * Bear?" prompt and keyboard activation apply.
 */
export const SaveToFocusBearLink: React.FC<SaveToFocusBearLinkProps> = ({ taskTitle, source }) => {
  const { t } = useTranslation();
  const { isConnected, suggestions, isLoading, loadSuggestions } = useFocusBearTaskSuggestions(taskTitle, source);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const panelToggleRef = useRef<HTMLButtonElement>(null);

  const buildHref = useCallback(
    (choice: FocusBearTaskChoice) =>
      buildFocusBearTaskLink({
        title: taskTitle,
        notes: t('emailDetail.focusBearTaskNotes', { sender: source.sender, subject: source.emailSubject }),
        link: source.emailUrl,
        ...choice,
      }),
    [taskTitle, source, t]
  );

  /** Without the panel: the suggestions as they are, waited for briefly when they haven't arrived yet. */
  const quickSave = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isConnected || suggestions) {
      const choice = suggestedChoice(suggestions);
      recordSave(choice, false, choice);
      return;
    }
    event.preventDefault();
    void waitAtMost(loadSuggestions(), FOCUS_BEAR_QUICK_SAVE_WAIT_MS).then(loaded => {
      const choice = suggestedChoice(loaded);
      recordSave(choice, false, choice);
      window.location.assign(buildHref(choice));
    });
  };

  const highlightAndPrefetch = (event: React.SyntheticEvent<HTMLElement>) => {
    setOpacity(event, ACTIVE_OPACITY);
    void loadSuggestions();
  };

  const togglePanel = () => {
    if (!isPanelOpen && !suggestions) {
      void loadSuggestions();
    }
    setIsPanelOpen(open => !open);
  };

  return (
    <span className={POSTHOG_NO_CAPTURE_CLASS} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <a
        href={buildHref(suggestedChoice(suggestions))}
        aria-label={t('emailDetail.saveToFocusBear')}
        title={t('emailDetail.saveToFocusBearHint', { task: taskTitle })}
        onClick={quickSave}
        onMouseEnter={highlightAndPrefetch}
        onMouseLeave={event => setOpacity(event, RESTING_OPACITY)}
        onFocus={highlightAndPrefetch}
        onBlur={event => setOpacity(event, RESTING_OPACITY)}
        style={quickSaveLinkStyle}
      >
        <span aria-hidden="true">{EMOJI_FOCUS_BEAR}</span>
      </a>
      <button
        ref={panelToggleRef}
        type="button"
        aria-label={t('emailDetail.focusBearSaveOptions')}
        title={t('emailDetail.focusBearSaveOptions')}
        aria-haspopup="dialog"
        aria-expanded={isPanelOpen}
        onClick={togglePanel}
        style={panelToggleStyle}
      >
        <FiChevronDown size={CHEVRON_SIZE} />
      </button>
      {isPanelOpen && panelToggleRef.current && (
        <SaveToFocusBearPanel
          anchor={panelToggleRef.current}
          taskTitle={taskTitle}
          isConnected={isConnected}
          suggestions={suggestions}
          isLoading={isLoading}
          buildHref={buildHref}
          onSave={choice => {
            recordSave(choice, true, suggestedChoice(suggestions));
            closePanel();
          }}
          onClose={closePanel}
        />
      )}
    </span>
  );
};
