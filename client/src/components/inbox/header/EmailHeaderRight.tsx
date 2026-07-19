import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore } from 'types/email';

interface EmailDebugTooltipProps {
  email: Email;
  anchorRect: DOMRect;
  onStopPropagation: (event: React.MouseEvent) => void;
}

const EmailDebugTooltip: React.FC<EmailDebugTooltipProps> = ({ email, anchorRect, onStopPropagation }) => {
  const { t } = useTranslation();
  const priorityScore = getEmailPriorityScore(email);
  const wasDeliveredEarly = email.wasDeliveredEarly ?? false;
  const yesNo = (value: boolean) => (value ? t('inbox.debugYes') : t('inbox.debugNo'));

  // Position the tooltip below the anchor, aligned to its right edge
  const top = anchorRect.bottom + window.scrollY + 4;
  const right = window.innerWidth - anchorRect.right;

  return createPortal(
    <div
      data-debug-tooltip
      style={{
        position: 'absolute',
        top,
        right,
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        boxShadow: theme.shadows.lg,
        padding: theme.spacing.md,
        zIndex: 1000,
        minWidth: '260px',
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.secondary,
        whiteSpace: 'nowrap',
      }}
      onClick={onStopPropagation}
    >
      <div
        style={{
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('inbox.debugTitle')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        <div>
          {t('inbox.debugPriorityScore')}: <strong>{priorityScore.toFixed(0)}</strong>
        </div>
        <div>
          {t('inbox.debugReceived')}: <strong>{new Date(email.receivedAt).toLocaleString()}</strong>
        </div>
        {email.batchReleaseAt && (
          <div>
            {t('inbox.debugDeliveredInBatch')}: <strong>{new Date(email.batchReleaseAt).toLocaleString()}</strong>
          </div>
        )}
        <div>
          {t('inbox.debugBatched')}: <strong>{yesNo(!!email.isBatched)}</strong>
        </div>
        <div>
          {t('inbox.debugEmergencyDelivery')}:{' '}
          <strong style={{ color: wasDeliveredEarly ? theme.colors.warning.main : 'inherit' }}>
            {yesNo(wasDeliveredEarly)}
          </strong>
        </div>
        <div>
          {t('inbox.debugReason')}:{' '}
          <strong>{email.batchDecisionReason || t('inbox.debugReasonNone')}</strong>
        </div>
      </div>
    </div>,
    document.body
  );
};

interface EmailHeaderRightProps {
  email: Email;
}

export const EmailHeaderRight: React.FC<EmailHeaderRightProps> = ({ email }) => {
  const [showDebug, setShowDebug] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    const target = event.target as Node;
    if (spanRef.current && !spanRef.current.contains(target)) {
      const debugTooltip = document.querySelector('[data-debug-tooltip]');
      if (!debugTooltip || !debugTooltip.contains(target)) {
        setShowDebug(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!showDebug) {
      return;
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDebug, handleClickOutside]);

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (spanRef.current) {
      setAnchorRect(spanRef.current.getBoundingClientRect());
    }
    setShowDebug(prev => !prev);
  };

  const stopPropagation = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <span
      ref={spanRef}
      style={{
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.tertiary,
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
      }}
      onClick={handleClick}
    >
      {new Date(email.receivedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
      {showDebug && anchorRect && (
        <EmailDebugTooltip email={email} anchorRect={anchorRect} onStopPropagation={stopPropagation} />
      )}
    </span>
  );
};
