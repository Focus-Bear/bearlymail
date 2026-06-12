import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { SidebarPageLayout } from 'components/layout/SidebarPageLayout';
import { EnrichmentProgress } from 'components/search/EnrichmentProgress';
import { SearchForm } from 'components/search/SearchForm';
import { SearchHeader } from 'components/search/SearchHeader';
import { SearchProgress } from 'components/search/SearchProgress';
import { SearchResults } from 'components/search/SearchResults';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { PRIORITY_HIGH_THRESHOLD, PRIORITY_MEDIUM_THRESHOLD, PRIORITY_VERY_HIGH_THRESHOLD } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';
import { useSearch } from 'hooks/useSearch';

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
  debugInfo?: Record<string, unknown>;
}

const getPriorityBadge = (score?: number) => {
  if (score === undefined || score === null) {
    return { label: 'N/A', color: theme.colors.text.tertiary, bg: theme.colors.background.subtle };
  }
  if (score > PRIORITY_VERY_HIGH_THRESHOLD) {
    return { label: 'Very High', color: theme.colors.accent.error, bg: theme.colors.sunray.light4 };
  }
  if (score > PRIORITY_HIGH_THRESHOLD) {
    return { label: 'High', color: theme.colors.accent.error, bg: theme.colors.sunray.light4 };
  }
  if (score > PRIORITY_MEDIUM_THRESHOLD) {
    return { label: 'Medium', color: theme.colors.accent.warning, bg: theme.colors.sunray.light3 };
  }
  if (score >= 0) {
    return { label: 'Low', color: theme.colors.text.tertiary, bg: theme.colors.background.subtle };
  }
  return { label: 'Very Low', color: theme.colors.text.secondary, bg: theme.colors.background.subtle };
};

const getScoreBackgroundColor = (score: number) => {
  if (score > PRIORITY_HIGH_THRESHOLD) {
    return theme.colors.sunray.light4;
  }
  if (score >= PRIORITY_MEDIUM_THRESHOLD) {
    return theme.colors.sunray.light3;
  }
  return theme.colors.background.subtle;
};

const getScoreColor = (score: number) => {
  if (score > PRIORITY_HIGH_THRESHOLD) {
    return theme.colors.accent.success;
  }
  if (score >= PRIORITY_MEDIUM_THRESHOLD) {
    return theme.colors.accent.warning;
  }
  return theme.colors.text.tertiary;
};

interface ScoreBreakdownModalProps {
  scoreInfo: { email: SearchEmail; breakdown: NonNullable<SearchEmail['scoreBreakdown']> };
  onClose: () => void;
}

const ScoreBreakdownModal: React.FC<ScoreBreakdownModalProps> = ({ scoreInfo, onClose }) => {
  const { t } = useTranslation();
  const { email, breakdown } = scoreInfo;
  const recencyColor = breakdown.recencyAdjustment >= 0 ? theme.colors.accent.success : theme.colors.accent.error;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.overlay.dark,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          maxWidth: '500px',
          width: '90%',
          boxShadow: theme.shadows.lg,
        }}
      >
        <h3
          style={{
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
          }}
        >
          {t('search.scoreBreakdown')}
        </h3>
        <div style={{ marginBottom: theme.spacing.md }}>
          <div
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              marginBottom: theme.spacing.xs,
            }}
          >
            <strong>{email.fromName || email.from}</strong>
            <span style={{ marginLeft: theme.spacing.xs }}>{email.subject}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          <div
            style={{
              padding: theme.spacing.md,
              backgroundColor: theme.colors.background.subtle,
              borderRadius: theme.borderRadius.md,
            }}
          >
            <div
              style={{
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.sm,
                marginBottom: theme.spacing.xs,
              }}
            >
              {t('search.baseRelevanceScore')}
            </div>
            <div
              style={{
                color: theme.colors.text.primary,
                fontSize: theme.typography.fontSize['2xl'],
                fontWeight: theme.typography.fontWeight.bold,
              }}
            >
              {breakdown.baseRelevanceScore}
            </div>
            <div
              style={{
                color: theme.colors.text.tertiary,
                fontSize: theme.typography.fontSize.xs,
                marginTop: theme.spacing.xs,
              }}
            >
              {t('search.baseRelevanceDescription')}
            </div>
          </div>
          <div
            style={{
              padding: theme.spacing.md,
              backgroundColor: theme.colors.background.subtle,
              borderRadius: theme.borderRadius.md,
            }}
          >
            <div
              style={{
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.sm,
                marginBottom: theme.spacing.xs,
              }}
            >
              {t('search.recencyAdjustment')}
            </div>
            <div
              style={{
                color: recencyColor,
                fontSize: theme.typography.fontSize['2xl'],
                fontWeight: theme.typography.fontWeight.bold,
              }}
            >
              {breakdown.recencyAdjustment >= 0 ? '+' : ''}
              {breakdown.recencyAdjustment}
            </div>
            <div
              style={{
                color: theme.colors.text.tertiary,
                fontSize: theme.typography.fontSize.xs,
                marginTop: theme.spacing.xs,
              }}
            >
              {t('search.recencyDescription')}
            </div>
          </div>
          <div
            style={{
              padding: theme.spacing.md,
              backgroundColor: theme.colors.primary.subtle,
              borderRadius: theme.borderRadius.md,
              border: `2px solid ${theme.colors.primary.main}`,
            }}
          >
            <div
              style={{
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.sm,
                marginBottom: theme.spacing.xs,
              }}
            >
              {t('search.finalScore')}
            </div>
            <div
              style={{
                color: theme.colors.primary.main,
                fontSize: theme.typography.fontSize['2xl'],
                fontWeight: theme.typography.fontWeight.bold,
              }}
            >
              {breakdown.finalScore}
            </div>
            <div
              style={{
                color: theme.colors.text.tertiary,
                fontSize: theme.typography.fontSize.xs,
                marginTop: theme.spacing.xs,
              }}
            >
              {t('search.finalScoreDescription')}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: theme.spacing.lg,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
            width: '100%',
          }}
        >
          {t('search.close')}
        </button>
      </div>
    </div>
  );
};

const Search: React.FC = () => {
  const { t } = useTranslation();
  const search = useSearch();
  const [selectedScoreBreakdown, setSelectedScoreBreakdown] = useState<{
    email: SearchEmail;
    breakdown: NonNullable<SearchEmail['scoreBreakdown']>;
  } | null>(null);

  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.SEARCH_VIEWED);
  }, []);

  const handleSelectScoreBreakdown = (email: SearchEmail, breakdown: NonNullable<SearchEmail['scoreBreakdown']>) => {
    setSelectedScoreBreakdown({ email, breakdown });
  };

  return (
    <SidebarPageLayout fullBleed>
      <SearchHeader />

      <div
        style={{
          padding: theme.spacing.xl,
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <SearchForm
          query={search.query}
          loading={search.loading}
          onQueryChange={search.setQuery}
          onSubmit={search.handleSearch}
        />

        {search.connectedAccounts.length > 1 && (
          <div
            style={{
              marginTop: theme.spacing.md,
              marginBottom: theme.spacing.md,
              padding: theme.spacing.md,
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border.light}`,
            }}
          >
            <div
              style={{
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.sm,
              }}
            >
              {t('search.searchAccounts')}:
            </div>
            <div
              style={{
                display: 'flex',
                gap: theme.spacing.sm,
                flexWrap: 'wrap',
              }}
            >
              {search.connectedAccounts.map(account => {
                const isSelected = search.selectedAccountTypes.includes(account.provider);
                const accountLabel = account.email || `${account.provider} account`;

                return (
                  <button
                    key={account.provider}
                    onClick={() => search.handleAccountToggle(account.provider)}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                      backgroundColor: isSelected ? theme.colors.primary.main : theme.colors.background.subtle,
                      color: isSelected ? 'white' : theme.colors.text.secondary,
                      border: `1px solid ${isSelected ? theme.colors.primary.main : theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.full,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                      fontWeight: theme.typography.fontWeight.medium,
                      transition: theme.transitions.default,
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                    }}
                    onMouseEnter={event => {
                      if (!isSelected) {
                        event.currentTarget.style.backgroundColor = theme.colors.background.default;
                      }
                    }}
                    onMouseLeave={event => {
                      if (!isSelected) {
                        event.currentTarget.style.backgroundColor = theme.colors.background.subtle;
                      }
                    }}
                  >
                    <span>{isSelected ? '✓' : ''}</span>
                    <span>{accountLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {search.hasSearched && (
          <div>
            {search.loading ? (
              <SearchProgress progressStep={search.progressStep} />
            ) : (
              <>
                {search.enrichmentProgress && (
                  <EnrichmentProgress
                    enriched={search.enrichmentProgress.enriched}
                    total={search.enrichmentProgress.total}
                    failed={search.enrichmentProgress.failed}
                  />
                )}
                <SearchResults
                  searchResults={search.searchResults}
                  isRefining={search.isRefining}
                  refiningMessage={search.progressStep || undefined}
                  onSelectScoreBreakdown={handleSelectScoreBreakdown}
                  getScoreBackgroundColor={getScoreBackgroundColor}
                  getScoreColor={getScoreColor}
                  getPriorityBadge={getPriorityBadge}
                  queriesTried={search.queriesTried}
                  searchDurationMs={search.searchDurationMs}
                  instantResults={search.isInstantSearch ? search.instantResults : undefined}
                  isInstantEmpty={search.isInstantSearch ? search.isInstantEmpty : undefined}
                  instantRankStatus={search.isInstantSearch ? search.instantRankStatus : undefined}
                />
              </>
            )}
          </div>
        )}
      </div>

      {selectedScoreBreakdown && (
        <ScoreBreakdownModal scoreInfo={selectedScoreBreakdown} onClose={() => setSelectedScoreBreakdown(null)} />
      )}
    </SidebarPageLayout>
  );
};

export default Search;
