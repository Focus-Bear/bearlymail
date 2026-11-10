import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { FocusBearTaskSuggestions } from 'queries/useFocusBear';
import { theme } from 'theme/theme';

import { POSTHOG_NO_CAPTURE_CLASS } from 'constants/analytics-events';
import { Z_INDEX_DROPDOWN } from 'constants/numbers';
import { SETTINGS_ANCHORS, settingsAnchorPath } from 'constants/settingsAnchors';

const PANEL_WIDTH_PX = 280;
const PANEL_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
/** Below this share of the viewport the anchor has room underneath; further down the panel opens upwards. */
const OPEN_UPWARDS_FROM_VIEWPORT_SHARE = 0.6;
const NO_PROJECT = '';
const ESCAPE_KEY = 'Escape';

/** What the panel saves with: a project id and a `YYYY-MM-DD` day, each optional. */
export interface FocusBearTaskChoice {
  projectId?: string;
  dueDate?: string;
}

interface SaveToFocusBearPanelProps {
  /** The control that opened the panel: it is placed next to it, and clicks on it don't count as outside. */
  anchor: HTMLElement;
  taskTitle: string;
  isConnected: boolean;
  /** Null while they load, or when there is no connection. */
  suggestions: FocusBearTaskSuggestions | null;
  isLoading: boolean;
  buildHref: (choice: FocusBearTaskChoice) => string;
  onSave: (choice: FocusBearTaskChoice) => void;
  onClose: () => void;
}

const suggestedFieldStyle: React.CSSProperties = {
  borderColor: theme.colors.primary.main,
  borderStyle: 'dashed',
  backgroundColor: theme.colors.primary.subtle,
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  fontSize: theme.typography.fontSize.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.sm,
  backgroundColor: theme.colors.background.paper,
  color: theme.colors.text.primary,
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

const saveLinkStyle: React.CSSProperties = {
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.inverse,
  backgroundColor: theme.colors.primary.main,
  borderRadius: theme.borderRadius.sm,
  textDecoration: 'none',
};

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
 * a scroll of the page under it, which would leave it pointing at nothing.
 */
function useDismissOnOutsideInteraction(
  panelRef: React.RefObject<HTMLDivElement | null>,
  anchor: HTMLElement,
  onClose: () => void
) {
  useEffect(() => {
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && (Boolean(panelRef.current?.contains(target)) || anchor.contains(target));
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === ESCAPE_KEY) {
        onClose();
      }
    };
    const closeOnOutsideEvent = (event: Event) => {
      if (!isInside(event.target)) {
        onClose();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeOnOutsideEvent);
    window.addEventListener('scroll', closeOnOutsideEvent, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeOnOutsideEvent);
      window.removeEventListener('scroll', closeOnOutsideEvent, true);
      window.removeEventListener('resize', onClose);
    };
  }, [panelRef, anchor, onClose]);
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
 * "Save to Focus Bear" with the task's project and due date shown before it is
 * saved: Focus Bear's suggestions arrive pre-selected and marked "Suggested", and
 * the user can change either. Saving opens the same focusbear://create-task link.
 */
export const SaveToFocusBearPanel: React.FC<SaveToFocusBearPanelProps> = ({
  anchor,
  taskTitle,
  isConnected,
  suggestions,
  isLoading,
  buildHref,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const project = useSuggestedValue(suggestions?.project?.id);
  const dueDate = useSuggestedValue(suggestions?.dueDate ?? undefined);
  const choice: FocusBearTaskChoice = { projectId: project.value || undefined, dueDate: dueDate.value || undefined };
  const [placement] = useState(() => placementNextTo(anchor));
  useDismissOnOutsideInteraction(panelRef, anchor, onClose);

  return createPortal(
    <div
      ref={panelRef}
      className={POSTHOG_NO_CAPTURE_CLASS}
      role="dialog"
      aria-label={t('emailDetail.saveToFocusBear')}
      style={{ ...panelStyle, ...placement }}
    >
      <div style={{ fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.semibold }}>
        {t('emailDetail.saveToFocusBear')}
      </div>
      <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, wordBreak: 'break-word' }}>
        {taskTitle}
      </div>
      {isConnected && isLoading && (
        <div role="status" style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>
          {t('emailDetail.focusBearFindingSuggestions')}
        </div>
      )}
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
      <SuggestedField label={t('emailDetail.focusBearDueDate')} isSuggested={dueDate.isSuggested}>
        {fieldProps => (
          <input {...fieldProps} type="date" value={dueDate.value} onChange={event => dueDate.choose(event.target.value)} />
        )}
      </SuggestedField>
      {!isConnected && <ConnectFocusBearHint />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
        <button type="button" onClick={onClose} style={cancelButtonStyle}>
          {t('common.cancel')}
        </button>
        <a href={buildHref(choice)} onClick={() => onSave(choice)} style={saveLinkStyle}>
          {t('emailDetail.focusBearSave')}
        </a>
      </div>
    </div>,
    document.body
  );
};
