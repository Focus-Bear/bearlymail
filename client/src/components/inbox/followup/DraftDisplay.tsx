import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import {
  FOLLOW_UP_SEND_STATUS_FAILED,
  FOLLOW_UP_SEND_STATUS_SENDING,
  FOLLOW_UP_SEND_STATUS_SENT,
  STRING_NONE,
} from 'constants/strings';

interface DraftDisplayProps {
  draftFollowUp: string;
  onEdit: () => void;
  onSend: () => void;
  sendStatus: 'pending' | 'sending' | 'sent' | 'failed' | null;
  sendError: string | null;
}

const getSendButtonText = (
  sendStatus: 'pending' | 'sending' | 'sent' | 'failed' | null,
  tFunc: (key: string) => string
): string => {
  if (sendStatus === FOLLOW_UP_SEND_STATUS_SENDING) {
    return tFunc('inbox.sending');
  }
  if (sendStatus === FOLLOW_UP_SEND_STATUS_SENT) {
    return tFunc('inbox.sent');
  }
  return tFunc('common.send');
};

const getSendButtonBg = (sendStatus: 'pending' | 'sending' | 'sent' | 'failed' | null): string => {
  if (sendStatus === FOLLOW_UP_SEND_STATUS_SENT) {
    return theme.colors.success.main;
  }
  return theme.colors.primary.main;
};

export const DraftDisplay: React.FC<DraftDisplayProps> = ({ draftFollowUp, onEdit, onSend, sendStatus, sendError }) => {
  const { t } = useTranslation();
  const isDisabled = sendStatus === FOLLOW_UP_SEND_STATUS_SENDING || sendStatus === FOLLOW_UP_SEND_STATUS_SENT;

  return (
    <>
      <div
        style={{
          padding: theme.spacing.sm,
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.sm,
          marginBottom: theme.spacing.sm,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          whiteSpace: 'pre-wrap',
        }}
      >
        {draftFollowUp}
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={event => {
            event.stopPropagation();
            onEdit();
          }}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.primary.main,
            border: `1px solid ${theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {t('common.edit')}
        </button>
        <button
          onClick={event => {
            event.stopPropagation();
            onSend();
          }}
          disabled={isDisabled}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: getSendButtonBg(sendStatus),
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            opacity: isDisabled ? OPACITY_DISABLED : OPACITY_FULL,
          }}
        >
          {getSendButtonText(sendStatus, t)}
        </button>
        {sendStatus === FOLLOW_UP_SEND_STATUS_FAILED && sendError && (
          <span
            style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.error.main,
            }}
          >
            {t('inbox.sendFailed')}: {sendError}
          </span>
        )}
      </div>
    </>
  );
};
