import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { MAX_SEARCH_RESULT_LENGTH } from 'constants/numbers';
import { SEARCH_RESULT_NO_RESULTS } from 'constants/strings';
import { captureEvent } from 'utils/posthog';
import { Email, getEmailPriorityScore } from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';

interface SearchEmail extends Email {
  starCount?: number;
  searchExplanation?: string;
  relevanceScore?: number;
  scoreBreakdown?: {
    baseRelevanceScore: number;
    recencyAdjustment: number;
    finalScore: number;
    rejectionReason?: string;
  };
  debugInfo?: any;
}

interface SearchResultsProps {
  searchResults: Email[];
  onSelectScoreBreakdown: (email: SearchEmail, breakdown: NonNullable<SearchEmail['scoreBreakdown']>) => void;
  getScoreBackgroundColor: (score: number) => string;
  getScoreColor: (score: number) => string;
  getPriorityBadge: (score?: number) => { label: string; color: string; bg: string };
}

// eslint-disable-next-line max-lines-per-function -- Search results component requires handling multiple result types and UI states
export const SearchResults: React.FC<SearchResultsProps> = ({
  searchResults,
  onSelectScoreBreakdown,
  getScoreBackgroundColor,
  getScoreColor,
  getPriorityBadge,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const hasNoResults = searchResults.length === 0 || (searchResults.length === 1 && searchResults[0].id === SEARCH_RESULT_NO_RESULTS);

  if (hasNoResults) {
    return (
      <div style={{
        textAlign: 'center',
        padding: theme.spacing['3xl'],
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        border: `1px dashed ${theme.colors.border.medium}`,
      }}>
        <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>🔍</div>
        <h3 style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
        }}>
          {t('search.noResults')}
        </h3>
        <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
          {t('search.noResultsHint')}
        </p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.md,
    }}>
      <div style={{
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.sm,
        marginBottom: theme.spacing.sm,
      }}>
        {t('search.found', { count: searchResults.length, plural: searchResults.length !== 1 ? 's' : '' })}
      </div>
      
      {/* eslint-disable-next-line max-lines-per-function -- Search result rendering requires handling multiple result types and UI states */}
      {searchResults.filter((email) => email.id !== SEARCH_RESULT_NO_RESULTS).map((email, index) => {
        const searchEmail = email as SearchEmail;
        const emailPriorityScore = getEmailPriorityScore(searchEmail);
        const priority = getPriorityBadge(emailPriorityScore);
        return (
          <div
            key={email.id}
            onClick={() => {
              captureEvent('search_result_clicked', {
                result_index: index,
                email_id: email.id,
              });
              navigate(`/email/${email.id}`);
            }}
            style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.lg,
              border: `1px solid ${theme.colors.border.light}`,
              cursor: 'pointer',
              transition: theme.transitions.default,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = theme.shadows.md;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, flex: 1 }}>
                <strong style={{
                  color: theme.colors.text.primary,
                  fontSize: theme.typography.fontSize.base,
                }}>
                  {email.fromName || email.from}
                </strong>
                {searchEmail.relevanceScore !== undefined && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (searchEmail.scoreBreakdown) {
                        onSelectScoreBreakdown(searchEmail, searchEmail.scoreBreakdown);
                      }
                    }}
                    style={{
                      fontSize: theme.typography.fontSize.xs,
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: getScoreBackgroundColor(searchEmail.relevanceScore),
                      color: getScoreColor(searchEmail.relevanceScore),
                      borderRadius: theme.borderRadius.full,
                      fontWeight: theme.typography.fontWeight.medium,
                      cursor: searchEmail.scoreBreakdown ? 'pointer' : 'default',
                      textDecoration: searchEmail.scoreBreakdown ? 'underline' : 'none',
                    }}
                    title={searchEmail.scoreBreakdown ? t('search.clickToSeeBreakdown') : ''}
                  >
                    {t('search.relevance', { score: searchEmail.relevanceScore })}
                  </span>
                )}
                {emailPriorityScore !== undefined && !searchEmail.relevanceScore && priority && (
                  <span style={{
                    fontSize: theme.typography.fontSize.xs,
                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                    backgroundColor: priority.bg,
                    color: priority.color,
                    borderRadius: theme.borderRadius.full,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}>
                    {priority.label} ({emailPriorityScore.toFixed(0)})
                  </span>
                )}
                {email.starCount && email.starCount > 0 && (
                  <span style={{ color: theme.colors.accent.warning }}>
                    {'⭐'.repeat(email.starCount)}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.tertiary,
              }}>
                {humanizeTimestamp(email.receivedAt)}
              </span>
            </div>
            <div style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.bold,
              marginBottom: theme.spacing.sm,
            }}>
              {email.subject}
            </div>
            <div style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: searchEmail.searchExplanation ? theme.spacing.xs : 0,
            }}>
              {(email.body || '').substring(0, MAX_SEARCH_RESULT_LENGTH)}...
            </div>
            {searchEmail.searchExplanation && (
              <div style={{
                marginTop: theme.spacing.xs,
                padding: theme.spacing.sm,
                backgroundColor: theme.colors.primary.subtle,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
                fontStyle: 'italic',
                borderLeft: `3px solid ${theme.colors.primary.main}`,
              }}>
                💡 {searchEmail.searchExplanation}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};


