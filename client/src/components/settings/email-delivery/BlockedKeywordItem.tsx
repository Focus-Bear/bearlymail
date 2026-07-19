import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';

interface BlockedKeyword {
  id: string;
  keyword: string;
  exactMatch: boolean;
  reason?: string;
  blockedAt: string;
}

interface BlockedKeywordItemProps {
  keyword: BlockedKeyword;
  onUnblock: (id: string) => Promise<void>;
}

export const BlockedKeywordItem: React.FC<BlockedKeywordItemProps> = ({ keyword, onUnblock }) => {
  const { t } = useTranslation();

  return (
    <div
      key={keyword.id}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div>
        <div
          style={{
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <span>{keyword.keyword}</span>
          {keyword.exactMatch && (
            <span
              style={{
                fontSize: theme.typography.fontSize.xs,
                backgroundColor: theme.colors.primary.main,
                color: COLOR_NAMED_WHITE,
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                borderRadius: theme.borderRadius.sm,
              }}
            >
              {t('settings.blockedKeywords.exactMatch')}
            </span>
          )}
        </div>
        {keyword.reason && (
          <div
            style={{
              color: theme.colors.text.tertiary,
              fontSize: theme.typography.fontSize.xs,
              marginTop: theme.spacing.xs,
            }}
          >
            {t('settings.blockedKeywords.reason')}: {keyword.reason}
          </div>
        )}
        <div
          style={{
            color: theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.xs,
            marginTop: theme.spacing.xs,
          }}
        >
          {t('settings.blockedKeywords.blocked')} {new Date(keyword.blockedAt).toLocaleDateString()}
        </div>
      </div>
      <button
        onClick={() => {
          captureEvent(ANALYTICS_EVENTS.KEYWORD_UNBLOCKED);
          onUnblock(keyword.id);
        }}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.accent.error,
          border: `1px solid ${theme.colors.accent.error}`,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.blockedKeywords.unblock')}
      </button>
    </div>
  );
};
