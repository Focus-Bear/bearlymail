import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import {
  Email,
  EnrichedSearchResult,
  getEmailPriorityScore,
  GmailSearchResult,
  INSTANT_RANK_STATUS,
  InstantRankStatus,
} from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { MAX_SEARCH_RESULT_LENGTH, MS_PER_SECOND } from 'constants/numbers';
import { NAVIGATION_SOURCE_SEARCH, SEARCH_RESULT_NO_RESULTS, STATUS_PENDING, STRING_NA } from 'constants/strings';

interface SearchDebugInfo {
  message?: string;
  queriesTried?: Array<{ query: string; resultCount: number; accountType?: string }>;
  [key: string]: unknown;
}

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
  debugInfo?: SearchDebugInfo;
}

interface SearchResultsProps {
  searchResults: Email[];
  isRefining?: boolean;
  refiningMessage?: string;
  onSelectScoreBreakdown: (email: SearchEmail, breakdown: NonNullable<SearchEmail['scoreBreakdown']>) => void;
  getScoreBackgroundColor: (score: number) => string;
  getScoreColor: (score: number) => string;
  getPriorityBadge: (score?: number) => { label: string; color: string; bg: string };
  queriesTried?: Array<{ query: string; resultCount: number; accountType?: string }>;
  /** Wall-clock time (ms) the visible search took to return its first results. */
  searchDurationMs?: number | null;
  /** Instant search results (mix of pending GmailSearchResult and enriched Email). */
  instantResults?: Array<GmailSearchResult | Email>;
  /** True when the instant search path completed but returned zero results. */
  isInstantEmpty?: boolean;
  /** AI relevance re-rank lifecycle for instant results. */
  instantRankStatus?: InstantRankStatus | null;
}

/** Human-friendly search duration, e.g. "420ms" or "1.4s". */
function formatSearchDuration(ms: number): string {
  return ms < MS_PER_SECOND ? `${ms}ms` : `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}

/**
 * Card for a pending (metadata-only) instant search result.
 * Shows subject, sender, date, snippet and a subtle "Loading details…" indicator.
 * Navigation is disabled until the result is enriched (messageId is a Gmail hex string,
 * not a DB UUID — clicking would 404).
 */
const PendingResultCard: React.FC<{ result: GmailSearchResult }> = ({ result }) => {
  const { t } = useTranslation();
  return (
    <div
      key={result.messageId}
      title={t('search.pendingResultLoading', 'Opening available once details are loaded')}
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.light}`,
        cursor: 'not-allowed',
        opacity: 0.75,
        transition: theme.transitions.default,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: theme.spacing.xs,
        }}
      >
        <span style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
          {result.fromName || result.from}
        </span>
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
          {humanizeTimestamp(result.date)}
        </span>
      </div>
      <div
        style={{
          fontWeight: theme.typography.fontWeight.medium,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {result.subject}
      </div>
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {result.snippet}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
        <span style={{ fontSize: theme.typography.fontSize.xs }}>⏳</span>
        <span
          style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
            fontStyle: 'italic',
          }}
        >
          {t('search.pendingResultLoading', 'Opening available once details are loaded')}
        </span>
      </div>
    </div>
  );
};

/**
 * Small status chip clarifying how the instant results are currently ordered:
 * Gmail's native order, an in-flight AI re-rank, or the finished AI relevance order.
 */
const RankStatusChip: React.FC<{ status: InstantRankStatus }> = ({ status }) => {
  const { t } = useTranslation();
  const isRanking = status === INSTANT_RANK_STATUS.RE_RANKING;
  const label =
    status === INSTANT_RANK_STATUS.GMAIL_ORDER
      ? t('search.sortedByGmail')
      : isRanking
        ? t('search.reRankingByRelevance')
        : t('search.rankedByRelevance');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        fontSize: theme.typography.fontSize.sm,
        color: isRanking ? theme.colors.primary.main : theme.colors.text.tertiary,
        backgroundColor: isRanking ? theme.colors.primary.subtle : theme.colors.background.subtle,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        borderRadius: theme.borderRadius.full,
      }}
    >
      {isRanking && (
        <>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🤖</span>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </>
      )}
      <span>{label}</span>
    </span>
  );
};

export const SearchResults: React.FC<SearchResultsProps> = ({
  searchResults,
  isRefining,
  refiningMessage,
  onSelectScoreBreakdown,
  getScoreBackgroundColor,
  getScoreColor,
  getPriorityBadge,
  queriesTried,
  searchDurationMs,
  instantResults,
  isInstantEmpty,
  instantRankStatus,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  /** Open an email while remembering the search URL so the back button can return to these results. */
  const openEmail = (emailId: string, resultIndex: number) => {
    captureEvent(ANALYTICS_EVENTS.SEARCH_RESULT_CLICKED, {
      result_index: resultIndex,
      email_id: emailId,
    });
    navigate(`/email/${emailId}`, {
      state: { from: NAVIGATION_SOURCE_SEARCH, search: location.search },
    });
  };

  const durationLabel =
    typeof searchDurationMs === 'number' ? (
      <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
        {t('search.took', { duration: formatSearchDuration(searchDurationMs) })}
      </span>
    ) : null;

  // ---------------------------------------------------------------------------
  // Instant search path — render mixed pending/enriched results
  // ---------------------------------------------------------------------------

  // Empty state for instant search (no Email marker needed — just a flag)
  if (isInstantEmpty) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: theme.spacing['3xl'],
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          border: `1px dashed ${theme.colors.border.medium}`,
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>🔍</div>
        <h3 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.sm }}>{t('search.noResults')}</h3>
        <p style={{ color: theme.colors.text.secondary }}>{t('search.noResultsHint')}</p>
      </div>
    );
  }

  if (instantResults && instantResults.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.lg,
            marginBottom: theme.spacing.sm,
          }}
        >
          <span>
            {t('search.found', {
              count: instantResults.length,
              plural: instantResults.length !== 1 ? 's' : '',
            })}
          </span>
          {durationLabel}
          {instantRankStatus && <RankStatusChip status={instantRankStatus} />}
        </div>
        {instantResults.map((result, index) => {
          const gmailResult = result as GmailSearchResult;
          // Pending card (metadata only)
          if (gmailResult.enrichmentStatus === STATUS_PENDING) {
            return <PendingResultCard key={gmailResult.messageId} result={gmailResult} />;
          }
          // Enriched card — result is an EnrichedSearchResult; access priorityScore directly
          // rather than double-casting through Email → SearchEmail which is fragile and unsafe.
          const enriched = result as EnrichedSearchResult;
          const email = result as Email;
          const emailPriorityScore =
            enriched.priorityScore != null ? enriched.priorityScore : getEmailPriorityScore(email);
          const priority = getPriorityBadge(emailPriorityScore);
          return (
            <div
              key={email.id || gmailResult.messageId}
              onClick={() => openEmail(email.id, index)}
              style={{
                backgroundColor: theme.colors.background.paper,
                borderRadius: theme.borderRadius.lg,
                padding: theme.spacing.lg,
                border: `1px solid ${theme.colors.border.light}`,
                cursor: 'pointer',
                transition: theme.transitions.default,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: theme.spacing.xs,
                }}
              >
                <span style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
                  {email.fromName || email.from}
                </span>
                <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
                  {humanizeTimestamp(email.receivedAt ?? enriched.date)}
                </span>
              </div>
              <div
                style={{
                  fontWeight: theme.typography.fontWeight.medium,
                  color: theme.colors.text.primary,
                  marginBottom: theme.spacing.xs,
                }}
              >
                {email.subject}
              </div>
              <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
                {email.body?.slice(0, MAX_SEARCH_RESULT_LENGTH)}
              </div>
              {enriched.relevanceScore !== undefined ? (
                <div style={{ marginTop: theme.spacing.xs }}>
                  <span
                    style={{
                      fontSize: theme.typography.fontSize.xs,
                      color: getScoreColor(enriched.relevanceScore),
                      backgroundColor: getScoreBackgroundColor(enriched.relevanceScore),
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      borderRadius: theme.borderRadius.full,
                      fontWeight: theme.typography.fontWeight.medium,
                    }}
                  >
                    {t('search.relevance', { score: enriched.relevanceScore })}
                  </span>
                </div>
              ) : (
                priority && (
                  <div style={{ marginTop: theme.spacing.xs }}>
                    <span
                      style={{
                        fontSize: theme.typography.fontSize.xs,
                        color: priority.color,
                        backgroundColor: priority.bg,
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        borderRadius: theme.borderRadius.full,
                      }}
                    >
                      {priority.label}
                    </span>
                  </div>
                )
              )}
              {enriched.searchExplanation && (
                <div
                  style={{
                    marginTop: theme.spacing.xs,
                    padding: theme.spacing.sm,
                    backgroundColor: theme.colors.primary.subtle,
                    borderRadius: theme.borderRadius.sm,
                    fontSize: theme.typography.fontSize.sm,
                    color: theme.colors.text.secondary,
                    fontStyle: 'italic',
                    borderLeft: `3px solid ${theme.colors.primary.main}`,
                  }}
                >
                  💡 {enriched.searchExplanation}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const hasNoResults =
    searchResults.length === 0 || (searchResults.length === 1 && searchResults[0].id === SEARCH_RESULT_NO_RESULTS);

  // Extract debug info from the no-results marker if available
  const noResultsDebugInfo =
    hasNoResults && searchResults.length === 1 ? (searchResults[0] as SearchEmail).debugInfo : null;

  if (hasNoResults) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: theme.spacing['3xl'],
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          border: `1px dashed ${theme.colors.border.medium}`,
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>🔍</div>
        <h3
          style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.sm,
          }}
        >
          {t('search.noResults')}
        </h3>
        <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
          {t('search.noResultsHint')}
        </p>
        {noResultsDebugInfo?.message && (
          <p
            style={{
              color: theme.colors.accent.warning,
              fontSize: theme.typography.fontSize.lg,
              marginBottom: theme.spacing.md,
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.sunray.light3,
              borderRadius: theme.borderRadius.sm,
            }}
          >
            {'⚠️ '}
            {noResultsDebugInfo.message}
          </p>
        )}
        {(() => {
          // Use queriesTried from debugInfo if available, otherwise fall back to prop
          const hasDebugQueries = noResultsDebugInfo?.queriesTried && noResultsDebugInfo.queriesTried.length > 0;
          const fallbackQueries = queriesTried && queriesTried.length > 0 ? queriesTried : null;
          const triedQueries = hasDebugQueries ? noResultsDebugInfo!.queriesTried : fallbackQueries;
          if (!triedQueries) {
            return null;
          }
          return (
            <div
              style={{
                marginTop: theme.spacing.md,
                padding: theme.spacing.md,
                backgroundColor: theme.colors.background.subtle,
                borderRadius: theme.borderRadius.md,
                textAlign: 'left',
              }}
            >
              <p
                style={{
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.lg,
                  marginBottom: theme.spacing.sm,
                  fontWeight: theme.typography.fontWeight.medium,
                }}
              >
                {t('search.queriesUsed')}:
              </p>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: theme.spacing.lg,
                  color: theme.colors.text.tertiary,
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                {triedQueries.map((queryItem: { query: string; resultCount: number; accountType?: string }) => (
                  <li key={queryItem.query} style={{ marginBottom: theme.spacing.xs }}>
                    <code
                      style={{
                        backgroundColor: theme.colors.background.paper,
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        borderRadius: theme.borderRadius.sm,
                        fontFamily: 'monospace',
                      }}
                    >
                      {queryItem.query}
                    </code>
                    {queryItem.accountType && (
                      <span style={{ marginLeft: theme.spacing.sm, color: theme.colors.text.tertiary }}>
                        [{queryItem.accountType}]
                      </span>
                    )}
                    <span style={{ marginLeft: theme.spacing.sm, color: theme.colors.text.tertiary }}>
                      ({queryItem.resultCount} {t('search.results')})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        }}
      >
        <div
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.lg,
          }}
        >
          {t('search.found', { count: searchResults.length, plural: searchResults.length !== 1 ? 's' : '' })}
        </div>
        {durationLabel}
        {isRefining && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.primary.main,
              backgroundColor: theme.colors.primary.subtle,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.full,
            }}
          >
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🤖</span>
            <span>{refiningMessage || t('search.aiRefining')}</span>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>

      {queriesTried && queriesTried.length > 0 && (
        <details
          style={{
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.tertiary,
            marginBottom: theme.spacing.xs,
          }}
        >
          <summary style={{ cursor: 'pointer', color: theme.colors.text.secondary }}>
            {t('search.queriesUsed')} ({queriesTried.length})
          </summary>
          <ul style={{ margin: `${theme.spacing.xs} 0 0`, paddingLeft: theme.spacing.lg }}>
            {queriesTried.map(queriedItem => (
              <li key={queriedItem.query} style={{ marginTop: theme.spacing.xs }}>
                <code
                  style={{
                    backgroundColor: theme.colors.background.paper,
                    padding: `1px ${theme.spacing.xs}`,
                    borderRadius: theme.borderRadius.sm,
                    fontFamily: 'monospace',
                  }}
                >
                  {queriedItem.query}
                </code>
              </li>
            ))}
          </ul>
        </details>
      )}

      {searchResults
        .filter(email => email.id !== SEARCH_RESULT_NO_RESULTS)
        .map((email, index) => {
          const searchEmail = email as SearchEmail;
          const emailPriorityScore = getEmailPriorityScore(searchEmail);
          const priority = getPriorityBadge(emailPriorityScore);
          return (
            <div
              key={email.id}
              onClick={() => openEmail(email.id, index)}
              style={{
                backgroundColor: theme.colors.background.paper,
                borderRadius: theme.borderRadius.lg,
                padding: theme.spacing.lg,
                border: `1px solid ${theme.colors.border.light}`,
                cursor: 'pointer',
                transition: theme.transitions.default,
              }}
              onMouseEnter={event => {
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = theme.shadows.md;
              }}
              onMouseLeave={event => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: theme.spacing.xs,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, flex: 1 }}>
                  <strong
                    style={{
                      color: theme.colors.text.primary,
                      fontSize: theme.typography.fontSize.base,
                    }}
                  >
                    {email.fromName || email.from}
                  </strong>
                  {searchEmail.relevanceScore !== undefined && (
                    <span
                      onClick={event => {
                        event.stopPropagation();
                        if (searchEmail.scoreBreakdown) {
                          onSelectScoreBreakdown(searchEmail, searchEmail.scoreBreakdown);
                        }
                      }}
                      style={{
                        fontSize: theme.typography.fontSize.sm,
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
                  {searchEmail.priorityExplanation &&
                    emailPriorityScore !== undefined &&
                    !searchEmail.relevanceScore &&
                    priority &&
                    priority.label !== STRING_NA && (
                      <span
                        style={{
                          fontSize: theme.typography.fontSize.sm,
                          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                          backgroundColor: priority.bg,
                          color: priority.color,
                          borderRadius: theme.borderRadius.full,
                          fontWeight: theme.typography.fontWeight.medium,
                        }}
                      >
                        {priority.label} ({emailPriorityScore.toFixed(0)})
                      </span>
                    )}
                  {email.starCount && email.starCount > 0 && (
                    <span style={{ color: theme.colors.accent.warning }}>{'⭐'.repeat(email.starCount)}</span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: theme.typography.fontSize.sm,
                    color: theme.colors.text.tertiary,
                  }}
                >
                  {humanizeTimestamp(email.receivedAt)}
                </span>
              </div>
              <div
                style={{
                  color: theme.colors.text.primary,
                  fontSize: theme.typography.fontSize.lg,
                  fontWeight: theme.typography.fontWeight.bold,
                  marginBottom: theme.spacing.sm,
                }}
              >
                {email.subject}
              </div>
              <div
                style={{
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.lg,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: searchEmail.searchExplanation ? theme.spacing.xs : 0,
                }}
              >
                {(email.body || '').substring(0, MAX_SEARCH_RESULT_LENGTH)}...
              </div>
              {searchEmail.searchExplanation && (
                <div
                  style={{
                    marginTop: theme.spacing.xs,
                    padding: theme.spacing.sm,
                    backgroundColor: theme.colors.primary.subtle,
                    borderRadius: theme.borderRadius.sm,
                    fontSize: theme.typography.fontSize.sm,
                    color: theme.colors.text.secondary,
                    fontStyle: 'italic',
                    borderLeft: `3px solid ${theme.colors.primary.main}`,
                  }}
                >
                  💡 {searchEmail.searchExplanation}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};
