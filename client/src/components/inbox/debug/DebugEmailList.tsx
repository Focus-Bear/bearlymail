import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore } from 'types/email';

import { COLOR_NAMED_RED } from 'constants/colors';

interface DebugEmailListProps {
  emails: Email[];
  mode: import('types/email').InboxMode;
}

/**
 * Debug email list component
 * Displays current tab emails with debug information
 */
export const DebugEmailList: React.FC<DebugEmailListProps> = ({ emails, mode }) => {
  const { t } = useTranslation();

  const getBackgroundColor = (isArchived: boolean, isInWrongTab: boolean): string => {
    if (isArchived) {
      return '#FFE6E6';
    }
    if (isInWrongTab) {
      return '#F8D7DA';
    }
    return '#D1ECF1';
  };

  const getBorderColor = (isArchived: boolean, isInWrongTab: boolean): string => {
    if (isArchived || isInWrongTab) {
      return '#F5C6CB';
    }
    return '#BEE5EB';
  };

  return (
    <>
      <h4 style={{ margin: `0 0 ${theme.spacing.sm} 0` }}>{t('debug.emailList.title', { count: emails.length })}</h4>
      {emails.map(email => {
        const starCount = email.starCount ?? 0;
        const shouldBeIn = starCount > 0 ? 'action' : 'triage';
        const isInWrongTab = shouldBeIn !== mode;
        const isArchived = email.isArchived ?? false;

        return (
          <div
            key={email.id}
            style={{
              padding: theme.spacing.xs,
              marginBottom: theme.spacing.xs,
              backgroundColor: getBackgroundColor(isArchived, isInWrongTab),
              border: `1px solid ${getBorderColor(isArchived, isInWrongTab)}`,
              borderRadius: theme.borderRadius.sm,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: theme.spacing.xs,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  flex: 1,
                  minWidth: '200px',
                  overflow: 'visible',
                }}
              >
                <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  {t('debug.emailList.threadIdRow', { id: email.threadId?.substring(0, 8) })}
                  <br />
                  {t('debug.emailList.emailSummaryRow', {
                    id: email.id.substring(0, 8),
                    starCount,
                    archived: isArchived ? t('debug.emailList.yes') : t('debug.emailList.no'),
                  })}
                  <br />
                  {t('debug.emailList.tabSummaryRow', {
                    shouldBeIn,
                    currentTab: mode,
                    priority: getEmailPriorityScore(email).toFixed(1),
                  })}
                  {email.lastCheckedAt && (
                    <>
                      <br />
                      <strong>{t('debug.emailList.lastChecked')}:</strong>{' '}
                      {new Date(email.lastCheckedAt).toLocaleString()}
                    </>
                  )}
                  {isArchived && (
                    <span style={{ color: COLOR_NAMED_RED, fontWeight: 'bold' }}>
                      {' '}
                      {t('debug.emailList.archivedWarning')}
                    </span>
                  )}
                  {isInWrongTab && !isArchived && (
                    <span style={{ color: COLOR_NAMED_RED, fontWeight: 'bold' }}>
                      {' '}
                      {t('debug.emailList.wrongTabError')}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    color: theme.colors.text.secondary,
                  }}
                >
                  {email.subject || t('debug.emailList.noSubject')}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      {emails.length === 0 && (
        <div style={{ color: theme.colors.text.secondary }}>{t('debug.emailList.noThreads')}</div>
      )}
    </>
  );
};
