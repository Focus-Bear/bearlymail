import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_BG_ERROR_ALT, COLOR_NAMED_RED } from 'constants/colors';

interface MissingItem {
  threadId: string;
  reason: string;
  details: {
    starCount: number;
    emailCount: number;
    inGmail: boolean;
    subject: string;
  };
}

interface MissingFromProcessTabListProps {
  missingItems: MissingItem[];
}

const getMissingItemKey = (item: MissingItem, index: number): string => {
  return `missing-${item.threadId}-${index}`;
};

export const MissingFromProcessTabList: React.FC<MissingFromProcessTabListProps> = ({ missingItems = [] }) => {
  const { t } = useTranslation();

  if (!missingItems?.length) {
    return null;
  }

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <h5 style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: COLOR_NAMED_RED }}>
        {t('debug.missingFromActionTab.title')}:
      </h5>
      {missingItems.map((item, index) => (
        <div
          key={getMissingItemKey(item, index)}
          style={{
            padding: theme.spacing.sm,
            backgroundColor: COLOR_BG_ERROR_ALT,
            border: '1px solid #F5C6CB',
            borderRadius: theme.borderRadius.sm,
            marginBottom: theme.spacing.xs,
          }}
        >
          <div>
            <strong>{t('debug.missingFromActionTab.thread')}:</strong> {item.threadId}
          </div>
          <div>
            <strong>{t('debug.missingFromActionTab.reason')}:</strong>{' '}
            <span style={{ color: COLOR_NAMED_RED }}>{item.reason}</span>
          </div>
          <div>
            <strong>{t('debug.missingFromActionTab.details')}:</strong> {t('debug.missingFromActionTab.stars')}:{' '}
            {item.details.starCount} | {t('debug.missingFromActionTab.emails')}: {item.details.emailCount} |{' '}
            {t('debug.missingFromActionTab.inGmail')}: {item.details.inGmail ? '✅' : '❌'} |{' '}
            {t('debug.missingFromActionTab.subject')}: {item.details.subject}
          </div>
        </div>
      ))}
    </div>
  );
};
