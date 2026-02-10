import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore } from 'types/email';

interface EmailHeaderRightProps {
  email: Email;
}

export const EmailHeaderRight: React.FC<EmailHeaderRightProps> = ({ email }) => {
  const { t } = useTranslation();
  const [showDebug, setShowDebug] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDebug((prev) => !prev);
  };

  const priorityScore = getEmailPriorityScore(email);
  const wasDeliveredEarly = email.wasDeliveredEarly ?? false;
  const yesNo = (val: boolean) => val ? t('inbox.debugYes') : t('inbox.debugNo');

  return (
    <span
      style={{
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.tertiary,
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={handleClick}
    >
      {new Date(email.receivedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
      {showDebug && (
        <div
          data-debug-tooltip
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: theme.spacing.xs,
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            boxShadow: theme.shadows.lg,
            padding: theme.spacing.md,
            zIndex: 100,
            minWidth: '260px',
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
            whiteSpace: 'nowrap',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary, marginBottom: theme.spacing.sm }}>
            {t('inbox.debugTitle')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
            <div>{t('inbox.debugPriorityScore')}: <strong>{priorityScore.toFixed(0)}</strong></div>
            <div>{t('inbox.debugReceived')}: <strong>{new Date(email.receivedAt).toLocaleString()}</strong></div>
            <div>
              {t('inbox.debugBatched')}: <strong>{yesNo(!!email.isBatched)}</strong>
            </div>
            {email.batchReleaseAt && (
              <div>
                {t('inbox.debugBatchRelease')}: <strong>{new Date(email.batchReleaseAt).toLocaleString()}</strong>
              </div>
            )}
            <div>
              {t('inbox.debugEmergencyDelivery')}: <strong style={{ color: wasDeliveredEarly ? theme.colors.warning.main : 'inherit' }}>
                {yesNo(wasDeliveredEarly)}
              </strong>
            </div>
            {email.batchDecisionReason && (
              <div>
                {t('inbox.debugReason')}: <strong>{email.batchDecisionReason}</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
};






