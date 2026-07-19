import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_BG_ERROR_ALT, COLOR_NAMED_RED, COLOR_NAMED_WHITE, COLOR_SUCCESS_WEB } from 'constants/colors';
import { EMOJI_WARNING, EMOJI_WRENCH } from 'constants/emojis';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface OrphanEmail {
  id: string;
  threadId: string;
  emailThreadId: string | null;
  subject: string;
  from: string;
  receivedAt: string;
}

interface OrphanEmailListProps {
  orphanEmails: OrphanEmail[];
  onFixOrphans: () => void;
  fixingOrphans: boolean;
}

const getOrphanEmailKey = (email: OrphanEmail, index: number): string => {
  return `orphan-${email.id}-${index}`;
};

export const OrphanEmailList: React.FC<OrphanEmailListProps> = ({ orphanEmails = [], onFixOrphans, fixingOrphans }) => {
  const { t } = useTranslation();

  if (!orphanEmails?.length) {
    return null;
  }

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        }}
      >
        <h5 style={{ margin: 0, color: COLOR_NAMED_RED }}>
          {EMOJI_WARNING} {t('debug.orphan.title')}
        </h5>
        <button
          onClick={onFixOrphans}
          disabled={fixingOrphans}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: COLOR_SUCCESS_WEB,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            cursor: fixingOrphans ? 'not-allowed' : 'pointer',
            opacity: fixingOrphans ? OPACITY_DISABLED : OPACITY_FULL,
          }}
        >
          {fixingOrphans ? t('debug.orphan.fixing') : `${EMOJI_WRENCH} ${t('debug.orphan.fixButton')}`}
        </button>
      </div>
      {orphanEmails.slice(0, 10).map((email, index) => (
        <div
          key={getOrphanEmailKey(email, index)}
          style={{
            padding: theme.spacing.sm,
            backgroundColor: COLOR_BG_ERROR_ALT,
            border: '1px solid #F5C6CB',
            borderRadius: theme.borderRadius.sm,
            marginBottom: theme.spacing.xs,
          }}
        >
          <div>
            <strong>{t('debug.orphan.emailId')}:</strong> {email.id} | <strong>{t('debug.orphan.gmailThread')}:</strong>{' '}
            {email.threadId} | <strong>{t('debug.orphan.dbThread')}:</strong> {email.emailThreadId || t('common.null')}
          </div>
          <div
            style={{
              fontSize: '0.65rem',
              color: theme.colors.text.secondary,
            }}
          >
            {email.from}: {email.subject}
          </div>
        </div>
      ))}
      {orphanEmails.length > 10 && (
        <div style={{ color: theme.colors.text.secondary, fontStyle: 'italic' }}>
          {t('debug.orphan.more', { count: orphanEmails.length - 10 })}
        </div>
      )}
    </div>
  );
};
