import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';

import {
  COLOR_BG_ERROR,
  COLOR_BG_LIGHT_GRAY,
  COLOR_BG_NEUTRAL,
  COLOR_BG_NEUTRAL_ALT,
  COLOR_BG_WARNING,
  COLOR_ERROR_DARK,
  COLOR_ERROR_MED,
  COLOR_GREY_LIGHT,
  COLOR_GREY_MID,
  COLOR_WHITE,
} from 'constants/colors';
import { EMOJI_WARNING } from 'constants/emojis';
import { CATEGORY_OTHER, STRING_NONE } from 'constants/strings';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { CategorySummaryItem } from 'store/slices/emailSlice';

interface DebugCategorySummaryProps {
  categorySummary: CategorySummaryItem[] | null;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  expandedCategories: Set<string>;
  emails: Email[];
}

const getLoadedEmailsForCategory = (categoryKey: string, emails: Email[]): Email[] => {
  if (categoryKey === CATEGORY_OTHER) {
    return emails.filter(
      event =>
        !event.isArchived &&
        (event.category === null ||
          event.category === undefined ||
          event.category === '' ||
          event.category === CATEGORY_OTHER)
    );
  }
  return emails.filter(event => !event.isArchived && event.category === categoryKey);
};

const getCategoryStatus = (
  categoryKey: string,
  loadingCategoryNames: string[],
  loadedCategoryNames: string[]
): string => {
  if (loadingCategoryNames.includes(categoryKey)) {
    return '⏳ Loading';
  }
  if (loadedCategoryNames.includes(categoryKey)) {
    return '✅ Loaded';
  }
  return '⏸️ Not loaded';
};

interface CategoryTableProps extends DebugCategorySummaryProps {
  expandedDetails: Set<string>;
  toggleDetails: (key: string) => void;
  t: (tKey: string) => string;
}

const CategorySummaryTable: React.FC<CategoryTableProps> = ({
  categorySummary,
  loadedCategoryNames,
  loadingCategoryNames,
  expandedCategories,
  emails,
  expandedDetails,
  toggleDetails,
  t,
}) => {
  if (!categorySummary) {
    return (
      <div style={{ color: theme.colors.text.secondary, padding: theme.spacing.sm }}>
        {t('debug.categorySummary.noSummary')}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.sm,
        }}
      >
        <div
          style={{
            padding: theme.spacing.sm,
            backgroundColor: COLOR_WHITE,
            borderRadius: theme.borderRadius.sm,
            border: '1px solid #E0E0E0',
          }}
        >
          <strong>{t('debug.categorySummary.totalCategories')}:</strong> {categorySummary.length}
        </div>
        <div
          style={{
            padding: theme.spacing.sm,
            backgroundColor: COLOR_WHITE,
            borderRadius: theme.borderRadius.sm,
            border: '1px solid #E0E0E0',
          }}
        >
          <strong>{t('debug.categorySummary.loadedEmails')}:</strong> {emails.filter(event => !event.isArchived).length}
        </div>
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: COLOR_WHITE,
          borderRadius: theme.borderRadius.sm,
          overflow: 'hidden',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: COLOR_BG_NEUTRAL }}>
            {['category', 'summaryCount', 'loadedCount', 'status', 'expanded', 'details'].map(key => (
              <th
                key={key}
                style={{
                  padding: theme.spacing.sm,
                  textAlign: key === 'category' ? 'left' : 'center',
                  borderBottom: '1px solid #e0e0e0',
                }}
              >
                {t(`debug.categorySummary.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categorySummary.map(category => {
            // Use UUID key for all lookups to match what useEmailFetching stores
            const categoryKey = getCategoryKey(category.id, category.name);
            const loadedEmails = getLoadedEmailsForCategory(categoryKey, emails);
            const hasMismatch = loadedCategoryNames.includes(categoryKey) && loadedEmails.length !== category.count;
            const showDetails = expandedDetails.has(categoryKey);
            return (
              <React.Fragment key={categoryKey}>
                <tr style={{ backgroundColor: hasMismatch ? '#FFEBEE' : 'transparent' }}>
                  <td style={{ padding: theme.spacing.sm, borderBottom: '1px solid #e0e0e0', fontWeight: 'bold' }}>
                    {category.name}
                    {hasMismatch && (
                      <span
                        style={{
                          marginLeft: theme.spacing.xs,
                          color: COLOR_ERROR_MED,
                          fontSize: theme.typography.fontSize.xs,
                        }}
                      >
                        {EMOJI_WARNING} {t('debug.categorySummary.mismatch')}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: theme.spacing.sm, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {category.count}
                  </td>
                  <td
                    style={{
                      padding: theme.spacing.sm,
                      textAlign: 'center',
                      borderBottom: '1px solid #e0e0e0',
                      color: hasMismatch ? '#D32F2F' : 'inherit',
                      fontWeight: hasMismatch ? 'bold' : 'normal',
                    }}
                  >
                    {loadedCategoryNames.includes(categoryKey) ? loadedEmails.length : '-'}
                  </td>
                  <td style={{ padding: theme.spacing.sm, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {getCategoryStatus(categoryKey, loadingCategoryNames, loadedCategoryNames)}
                  </td>
                  <td style={{ padding: theme.spacing.sm, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {expandedCategories.has(categoryKey) ? '📂 Yes' : '📁 No'}
                  </td>
                  <td style={{ padding: theme.spacing.sm, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    <button
                      onClick={() => toggleDetails(categoryKey)}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: showDetails ? theme.colors.primary.main : '#f5f5f5',
                        color: showDetails ? COLOR_WHITE : theme.colors.text.primary,
                        border: STRING_NONE,
                        borderRadius: theme.borderRadius.sm,
                        cursor: 'pointer',
                        fontSize: theme.typography.fontSize.xs,
                      }}
                    >
                      {showDetails ? t('debug.categorySummary.hideDetails') : t('debug.categorySummary.showDetails')}
                    </button>
                  </td>
                </tr>
                {showDetails && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: theme.spacing.md,
                        backgroundColor: COLOR_BG_NEUTRAL_ALT,
                        borderBottom: '1px solid #e0e0e0',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                        <div>
                          <strong>{t('debug.categorySummary.categoryId')}:</strong>{' '}
                          <code
                            style={{
                              backgroundColor: COLOR_BG_LIGHT_GRAY,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: theme.typography.fontSize.xs,
                            }}
                          >
                            {category.id || 'null'}
                          </code>
                        </div>
                        <div>
                          <strong>
                            {t('debug.categorySummary.summaryThreadIds')} ({category.threadIds?.length ?? 0}):
                          </strong>
                          {category.threadIds && category.threadIds.length > 0 ? (
                            <div
                              style={{
                                maxHeight: '150px',
                                overflowY: 'auto',
                                marginTop: theme.spacing.xs,
                                backgroundColor: COLOR_WHITE,
                                padding: theme.spacing.xs,
                                borderRadius: theme.borderRadius.sm,
                                border: '1px solid #E0E0E0',
                              }}
                            >
                              {category.threadIds.map(threadId => (
                                <div
                                  key={threadId}
                                  style={{
                                    padding: '2px 4px',
                                    fontSize: theme.typography.fontSize.xs,
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {threadId}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.xs }}>
                              {t('debug.categorySummary.noThreadIds')}
                            </span>
                          )}
                        </div>
                        {loadedCategoryNames.includes(categoryKey) && (
                          <div>
                            <strong>
                              {t('debug.categorySummary.loadedThreadIds')} ({loadedEmails.length}):
                            </strong>
                            {loadedEmails.length > 0 ? (
                              <div
                                style={{
                                  maxHeight: '150px',
                                  overflowY: 'auto',
                                  marginTop: theme.spacing.xs,
                                  backgroundColor: COLOR_WHITE,
                                  padding: theme.spacing.xs,
                                  borderRadius: theme.borderRadius.sm,
                                  border: '1px solid #E0E0E0',
                                }}
                              >
                                {loadedEmails.map(email => (
                                  <div
                                    key={email.id}
                                    style={{
                                      padding: '2px 4px',
                                      fontSize: theme.typography.fontSize.xs,
                                      fontFamily: 'monospace',
                                      display: 'flex',
                                      gap: theme.spacing.sm,
                                    }}
                                  >
                                    <span style={{ color: COLOR_GREY_MID }}>{email.threadId}</span>
                                    <span style={{ color: COLOR_GREY_LIGHT }}>|</span>
                                    <span
                                      style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: '300px',
                                      }}
                                    >
                                      {email.subject}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span
                                style={{ color: COLOR_ERROR_MED, marginLeft: theme.spacing.xs, fontWeight: 'bold' }}
                              >
                                {EMOJI_WARNING} {t('debug.categorySummary.noLoadedEmails')}
                              </span>
                            )}
                          </div>
                        )}
                        {hasMismatch && (
                          <div
                            style={{
                              padding: theme.spacing.sm,
                              backgroundColor: COLOR_BG_ERROR,
                              borderRadius: theme.borderRadius.sm,
                              border: '1px solid #FFCDD2',
                              color: COLOR_ERROR_DARK,
                            }}
                          >
                            <strong>{EMOJI_WARNING} {t('debug.categorySummary.mismatchExplanation')}:</strong>
                            <br />
                            {t('debug.categorySummary.summaryShows')} {category.count}{' '}
                            {t('debug.categorySummary.emailsButLoaded')} {loadedEmails.length}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const DebugCategorySummarySection: React.FC<DebugCategorySummaryProps> = ({
  categorySummary,
  loadedCategoryNames,
  loadingCategoryNames,
  expandedCategories,
  emails,
}) => {
  const { t } = useTranslation();
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());

  const toggleDetails = (categoryKey: string) => {
    setExpandedDetails(prev => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  };

  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: COLOR_BG_WARNING,
        borderRadius: theme.borderRadius.sm,
        border: '1px solid #FFB74D',
      }}
    >
      <h4 style={{ margin: `0 0 ${theme.spacing.sm} 0` }}>📊 {t('debug.categorySummary.title')}</h4>

      <CategorySummaryTable
        categorySummary={categorySummary}
        loadedCategoryNames={loadedCategoryNames}
        loadingCategoryNames={loadingCategoryNames}
        expandedCategories={expandedCategories}
        emails={emails}
        expandedDetails={expandedDetails}
        toggleDetails={toggleDetails}
        t={t}
      />
    </div>
  );
};
