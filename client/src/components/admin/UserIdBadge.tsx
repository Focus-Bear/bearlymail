import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { STRING_MONOSPACE, STRING_POINTER, STRING_TRANSPARENT } from 'constants/strings';

const COPY_FEEDBACK_MS = 1500;

interface UserIdBadgeProps {
  userId: string;
}

/**
 * Small monospace display of a user's UUID with a copy-to-clipboard button,
 * so admins can grab the raw ID for support and debugging workflows.
 */
export const UserIdBadge: React.FC<UserIdBadgeProps> = ({ userId }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — nothing to do.
    }
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.xs,
      }}
    >
      <code
        data-testid="user-id-value"
        style={{
          fontFamily: STRING_MONOSPACE,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
          backgroundColor: theme.colors.background.default,
          padding: `0 ${theme.spacing.xs}`,
          borderRadius: theme.borderRadius.sm,
        }}
      >
        {userId}
      </code>
      <button
        onClick={handleCopy}
        data-testid="copy-user-id"
        aria-label={t('admin.dashboard.copyUserId')}
        style={{
          padding: `0 ${theme.spacing.xs}`,
          backgroundColor: STRING_TRANSPARENT,
          color: theme.colors.text.tertiary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
          cursor: STRING_POINTER,
          fontSize: theme.typography.fontSize.xs,
        }}
      >
        {copied ? t('admin.dashboard.copied') : t('admin.dashboard.copy')}
      </button>
    </div>
  );
};
