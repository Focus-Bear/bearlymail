import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface ForwardedAttachmentsListProps {
  attachments: EmailAttachment[];
  onRemove: (attachmentId: string) => void;
}

export const ForwardedAttachmentsList: React.FC<ForwardedAttachmentsListProps> = ({ attachments, onRemove }) => {
  const { t } = useTranslation();

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <div
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('compose.forwardedAttachments')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        {attachments.map(attachment => (
          <div
            key={attachment.attachmentId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              padding: theme.spacing.xs,
              backgroundColor: theme.colors.background.default,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            <span>📎</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: theme.colors.text.primary,
                }}
              >
                {attachment.filename}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(attachment.attachmentId)}
              style={{
                padding: theme.spacing.xs,
                backgroundColor: COLOR_TRANSPARENT,
                color: theme.colors.text.secondary,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
              }}
              onMouseEnter={event => {
                event.currentTarget.style.color = theme.colors.error.main;
              }}
              onMouseLeave={event => {
                event.currentTarget.style.color = theme.colors.text.secondary;
              }}
              aria-label={t('common.remove')}
            >
              {'\u2715'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
