import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { FocusBearTaskSuggestions } from 'queries/useFocusBear';
import { theme } from 'theme/theme';
import { DUE_DATE_STATUS, resolveFocusBearDueDate } from 'utils/focusBearDueDate';
import { parseTaskDurationMinutes } from 'utils/taskDuration';

import {
  DUE_DATE_MODE,
  DueDateField,
  type DueDateMode,
  DurationField,
  fieldStyle,
  isDurationInvalid,
  type TaskDurationInput,
} from 'components/email-detail-inline/SaveToFocusBearFields';
import { POSTHOG_NO_CAPTURE_CLASS } from 'constants/analytics-events';
import { OPACITY_DISABLED, OPACITY_FULL, Z_INDEX_DROPDOWN } from 'constants/numbers';
import { SETTINGS_ANCHORS, settingsAnchorPath } from 'constants/settingsAnchors';
import { KEY_ESCAPE } from 'constants/strings';

const PANEL_WIDTH_PX = 320;
const PANEL_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
/** Below this share of the viewport the anchor has room underneath; further down the panel opens upwards. */
const OPEN_UPWARDS_FROM_VIEWPORT_SHARE = 0.6;
const NO_PROJECT = '';

/**
 * What the panel saves with, each optional: a project id, a `YYYY-MM-DD` day (none means the next
 * free spot in the user's to-do list, which Focus Bear picks) and the task's length in minutes.
 */
export interface FocusBearTaskChoice {
  projectId?: string;
  dueDate?: string;
  durationMinutes?: number;
}

interface SaveToFocusBearPanelProps {
  /** The control that opened the panel: it is placed next to it, and clicks on it don't count as outside. */
  anchor: HTMLElement;
  taskTitle: string;
  isConnected: boolean;
  /** Null while they load, or when there is no connection. */
  suggestions: FocusBearTaskSuggestions | null;
  isLoading: boolean;
  onSave: (choice: FocusBearTaskChoice) => void;
  /** Closes the panel; `shouldRestoreFocus` when it was dismissed from the keyboard or by Cancel. */
  onClose: (shouldRestoreFocus: boolean) => void;
}

const suggestedFieldStyle: React.CSSProperties = {
  borderColor: theme.colors.primary.main,
  borderStyle: 'dashed',
  backgroundColor: theme.colors.primary.subtle,
};

const SuggestedBadge: React.FC = () => {
  const { t } = useTranslation();
  return (
    <span
      style={{
        marginLeft: theme.spacing.xs,
        fontSize: '0.625rem',
        fontWeight: theme.typography.fontWeight.semibold,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: theme.colors.primary.dark,
        backgroundColor: theme.colors.primary.subtle,
        padding: '1px 5px',
        borderRadius: theme.borderRadius.sm,
      }}
    >
      {t('emailDetail.focusBearSuggested')}
    </span>
  );
};

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  width: `${PANEL_WIDTH_PX}px`,
  padding: theme.spacing.md,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  boxShadow: theme.shadows.lg,
  zIndex: Z_INDEX_DROPDOWN,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.sm,
  textAlign: 'left',
};

const cancelButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: theme.colors.text.secondary,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.sm,
};

function saveButtonStyle(isDisabled: boolean): React.CSSProperties {
  return {
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
    backgroundColor: theme.colors.primary.main,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? OPACITY_DISABLED : OPACITY_FULL,
  };
}

/**
 * Fixed coordinates next to the anchor, right-aligned with it. The panel is rendered
 * into the body, because the action-items card clips anything that overflows it.
 */
function placementNextTo(anchor: HTMLElement): React.CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(VIEWPORT_MARGIN_PX, rect.right - PANEL_WIDTH_PX);
  if (rect.bottom > window.innerHeight * OPEN_UPWARDS_FROM_VIEWPORT_SHARE) {
    return { left, bottom: window.innerHeight - rect.top + PANEL_GAP_PX };
  }
  return { left, top: rect.bottom + PANEL_GAP_PX };
}

/** Keeps a field on its suggestion until the user picks something else. */
function useSuggestedValue(suggested: string | undefined) {
  const [value, setValue] = useState(suggested ?? '');
  const [isEdited, setIsEdited] = useState(false);
  useEffect(() => {
    if (!isEdited) {
      setValue(suggested ?? '');
    }
  }, [suggested, isEdited]);
  const choose = (next: string) => {
    setIsEdited(true);
    setValue(next);
  };
  const isSuggested = Boolean(suggested) && value === suggested;
  return { value, choose, isSuggested };
}

/**
 * Closes the panel on Escape, a click outside it (the anchor toggles it itself), or
 * a scroll of the page under it, which would leave it pointing at nothing. Only
 * Escape hands focus back to the anchor: a click outside put it where the user wanted.
 */
function useDismissOnOutsideInteraction(
  panelRef: React.RefObject<HTMLFormElement | null>,
  anchor: HTMLElement,
  onClose: (shouldRestoreFocus: boolean) => void
) {
  useEffect(() => {
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && (Boolean(panelRef.current?.contains(target)) || anchor.contains(target));
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE) {
        onClose(true);
      }
    };
    const closeOnOutsideEvent = (event: Event) => {
      if (!isInside(event.target)) {
        onClose(false);
      }
    };
    const closeOnResize = () => onClose(false);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeOnOutsideEvent);
    window.addEventListener('scroll', closeOnOutsideEvent, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeOnOutsideEvent);
      window.removeEventListener('scroll', closeOnOutsideEvent, true);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [panelRef, anchor, onClose]);
}

/** The due-date toggle and the custom day typed under it; "Next free spot" sends no day. */
function useDueDateChoice(locale: string) {
  const [mode, setMode] = useState<DueDateMode>(DUE_DATE_MODE.NEXT_FREE);
  const [customText, setCustomText] = useState('');
  const customDueDate = resolveFocusBearDueDate(customText, new Date(), locale);
  const isCustom = mode === DUE_DATE_MODE.CUSTOM;
  const dueDate = isCustom && customDueDate.status === DUE_DATE_STATUS.VALID ? customDueDate.day : undefined;
  return { mode, setMode, customText, setCustomText, customDueDate, dueDate, isReady: !isCustom || Boolean(dueDate) };
}

function useDurationChoice() {
  const [text, setText] = useState('');
  const duration: TaskDurationInput = { minutes: parseTaskDurationMinutes(text), isBlank: !text.trim() };
  const isInvalid = isDurationInvalid(duration);
  return { text, setText, duration, durationMinutes: isInvalid ? undefined : (duration.minutes ?? undefined), isInvalid };
}

/** Puts focus on the due-date toggle as the panel opens, so it can be used straight from the keyboard. */
function useFocusOnOpen(target: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    target.current?.focus({ preventScroll: true });
  }, [target]);
}

/** A labelled field, styled and badged as "Suggested" while it still holds Focus Bear's suggestion. */
const SuggestedField: React.FC<{
  label: string;
  isSuggested: boolean;
  children: (fieldProps: { id: string; style: React.CSSProperties }) => React.ReactNode;
}> = ({ label, isSuggested, children }) => {
  const id = useId();
  return (
    <>
      <label htmlFor={id} style={{ fontSize: theme.typography.fontSize.xs }}>
        {label}
        {isSuggested && <SuggestedBadge />}
      </label>
      {children({ id, style: { ...fieldStyle, ...(isSuggested ? suggestedFieldStyle : {}) } })}
    </>
  );
};

const ConnectFocusBearHint: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
      {t('emailDetail.focusBearConnectHint')}{' '}
      <Link to={settingsAnchorPath(SETTINGS_ANCHORS.FOCUS_BEAR)}>{t('emailDetail.focusBearConnectLink')}</Link>
    </div>
  );
};

/**
 * "Save task in Focus Bear": asks for the due date (the next free spot in the user's to-do list,
 * or a day typed snooze-style), how long the task takes, and, with Focus Bear connected, the
 * project, pre-selected to Focus Bear's suggestion and marked "Suggested". Saving opens the
 * focusbear://create-task link; Enter saves and Escape cancels.
 */
export const SaveToFocusBearPanel: React.FC<SaveToFocusBearPanelProps> = ({
  anchor,
  taskTitle,
  isConnected,
  suggestions,
  isLoading,
  onSave,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const panelRef = useRef<HTMLFormElement>(null);
  const selectedModeRef = useRef<HTMLInputElement>(null);
  const project = useSuggestedValue(suggestions?.project?.id);
  const due = useDueDateChoice(i18n.language);
  const duration = useDurationChoice();
  const [placement] = useState(() => placementNextTo(anchor));
  const canSave = due.isReady && !duration.isInvalid;
  useDismissOnOutsideInteraction(panelRef, anchor, onClose);
  useFocusOnOpen(selectedModeRef);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    onSave({ projectId: project.value || undefined, dueDate: due.dueDate, durationMinutes: duration.durationMinutes });
  };

  return createPortal(
    <form
      ref={panelRef}
      className={POSTHOG_NO_CAPTURE_CLASS}
      role="dialog"
      aria-label={t('emailDetail.saveTaskInFocusBear')}
      onSubmit={save}
      noValidate
      style={{ ...panelStyle, ...placement }}
    >
      <div style={{ fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.semibold }}>
        {t('emailDetail.saveTaskInFocusBear')}
      </div>
      <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, wordBreak: 'break-word' }}>
        {taskTitle}
      </div>
      {isConnected && isLoading && (
        <div role="status" style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>
          {t('emailDetail.focusBearFindingSuggestions')}
        </div>
      )}
      <DueDateField
        mode={due.mode}
        onModeChange={due.setMode}
        customText={due.customText}
        onCustomTextChange={due.setCustomText}
        customDueDate={due.customDueDate}
        suggestedDay={suggestions?.dueDate ?? null}
        selectedModeRef={selectedModeRef}
      />
      <DurationField text={duration.text} onTextChange={duration.setText} duration={duration.duration} />
      {isConnected && (
        <SuggestedField label={t('emailDetail.focusBearProject')} isSuggested={project.isSuggested}>
          {fieldProps => (
            <select {...fieldProps} value={project.value} onChange={event => project.choose(event.target.value)}>
              <option value={NO_PROJECT}>{t('emailDetail.focusBearNoProject')}</option>
              {(suggestions?.projects ?? []).map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          )}
        </SuggestedField>
      )}
      {!isConnected && <ConnectFocusBearHint />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
        <button type="button" onClick={() => onClose(true)} style={cancelButtonStyle}>
          {t('common.cancel')}
        </button>
        <button type="submit" aria-disabled={!canSave} style={saveButtonStyle(!canSave)}>
          {t('emailDetail.saveToFocusBear')}
        </button>
      </div>
    </form>,
    document.body
  );
};
