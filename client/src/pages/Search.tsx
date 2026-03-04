import React, { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { SearchForm } from 'components/search/SearchForm';
import { SearchHeader } from 'components/search/SearchHeader';
import { SearchProgress } from 'components/search/SearchProgress';
import { SearchResults } from 'components/search/SearchResults';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { PRIORITY_HIGH_THRESHOLD, PRIORITY_MEDIUM_THRESHOLD } from 'constants/numbers';
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
  debugInfo?: any;
}

const Search: React.FC = () => {
  const { t } = useTranslation();
  const search = useSearch();
  const [selectedScoreBreakdown, setSelectedScoreBreakdown] = useState<{
    email: SearchEmail;
    breakdown: NonNullable<SearchEmail['scoreBreakdown']>;
  } | null>(null);

  useEffect(() => {
    captureEvent('search_viewed');
  }, []);

  const getPriorityBadge = (score?: number) => {
    if (!score) return { label: 'N/A', color: theme.colors.text.tertiary, bg: theme.colors.background.subtle };
    // New calibration: < 0 = very low, 0-20 = low, 20-40 = medium, > 40 = high
    if (score > PRIORITY_HIGH_THRESHOLD) return { label: 'High', color: theme.colors.accent.error, bg: theme.colors.sunray.light4 };
    if (score >= PRIORITY_MEDIUM_THRESHOLD) return { label: 'Medium', color: theme.colors.accent.warning, bg: theme.colors.sunray.light3 };
    if (score >= 0) return { label: 'Low', color: theme.colors.text.tertiary, bg: theme.colors.background.subtle };
    return { label: 'Very Low', color: theme.colors.text.secondary, bg: theme.colors.background.subtle };
  };

  const getScoreBackgroundColor = (score: number) => {
    if (score > PRIORITY_HIGH_THRESHOLD) return theme.colors.sunray.light4;
    if (score >= PRIORITY_MEDIUM_THRESHOLD) return theme.colors.sunray.light3;
    return theme.colors.background.subtle;
  };

  const getScoreColor = (score: number) => {
    if (score > PRIORITY_HIGH_THRESHOLD) return theme.colors.accent.success;
    if (score >= PRIORITY_MEDIUM_THRESHOLD) return theme.colors.accent.warning;
    return theme.colors.text.tertiary;
  };

  const handleSelectScoreBreakdown = (email: SearchEmail, breakdown: NonNullable<SearchEmail['scoreBreakdown']>) => {
    setSelectedScoreBreakdown({ email, breakdown });
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <SearchHeader />

      <div style={{
        padding: theme.spacing.xl,
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
      }}>
        <SearchForm
          query={search.query}
          loading={search.loading}
          onQueryChange={search.setQuery}
          onSubmit={search.handleSearch}
        />

        {search.connectedAccounts.length > 1 && (
          <div style={{
            marginTop: theme.spacing.md,
            marginBottom: theme.spacing.md,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
          }}>
            <div style={{
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.sm,
            }}>
              {t('search.searchAccounts')}:
            </div>
            <div style={{
              display: 'flex',
              gap: theme.spacing.sm,
              flexWrap: 'wrap',
            }}>
              {search.connectedAccounts.map((account) => {
                const isSelected = search.selectedAccountTypes.includes(account.provider);
                const accountLabel = account.email || `${account.provider} account`;

                return (
                  <button
                    key={account.provider}
                    onClick={() => search.handleAccountToggle(account.provider)}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                      backgroundColor: isSelected
                        ? theme.colors.primary.main
                        : theme.colors.background.subtle,
                      color: isSelected
                        ? 'white'
                        : theme.colors.text.secondary,
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
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = theme.colors.background.default;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = theme.colors.background.subtle;
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
              <SearchResults
                searchResults={search.searchResults}
                isRefining={search.isRefining}
                refiningMessage={search.progressStep || undefined}
                onSelectScoreBreakdown={handleSelectScoreBreakdown}
                getScoreBackgroundColor={getScoreBackgroundColor}
                getScoreColor={getScoreColor}
                getPriorityBadge={getPriorityBadge}
                queriesTried={search.queriesTried}
              />
            )}
          </div>
        )}
      </div>

      {selectedScoreBreakdown && (
        <div
          onClick={() => setSelectedScoreBreakdown(null)}
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
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.xl,
              maxWidth: '500px',
              width: '90%',
              boxShadow: theme.shadows.lg,
            }}
          >
            <h3 style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.xl,
              fontWeight: theme.typography.fontWeight.bold,
              marginBottom: theme.spacing.md,
            }}>
              {t('search.scoreBreakdown')}
            </h3>
            <div style={{ marginBottom: theme.spacing.md }}>
              <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.xs }}>
                <strong>{selectedScoreBreakdown.email.fromName || selectedScoreBreakdown.email.from}</strong>
                <span style={{ marginLeft: theme.spacing.xs }}>{selectedScoreBreakdown.email.subject}</span>
              </div>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: theme.spacing.md,
            }}>
              <div style={{
                padding: theme.spacing.md,
                backgroundColor: theme.colors.background.subtle,
                borderRadius: theme.borderRadius.md,
              }}>
                <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.xs }}>
                  {t('search.baseRelevanceScore')}
                </div>
                <div style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold }}>
                  {selectedScoreBreakdown.breakdown.baseRelevanceScore}
                </div>
                <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.xs }}>
                  {t('search.baseRelevanceDescription')}
                </div>
              </div>
              <div style={{
                padding: theme.spacing.md,
                backgroundColor: theme.colors.background.subtle,
                borderRadius: theme.borderRadius.md,
              }}>
                <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.xs }}>
                  {t('search.recencyAdjustment')}
                </div>
                <div style={{
                  color: selectedScoreBreakdown.breakdown.recencyAdjustment >= 0 ? theme.colors.accent.success : theme.colors.accent.error,
                  fontSize: theme.typography.fontSize['2xl'],
                  fontWeight: theme.typography.fontWeight.bold,
                }}>
                  {selectedScoreBreakdown.breakdown.recencyAdjustment >= 0 ? '+' : ''}{selectedScoreBreakdown.breakdown.recencyAdjustment}
                </div>
                <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.xs }}>
                  {t('search.recencyDescription')}
                </div>
              </div>
              <div style={{
                padding: theme.spacing.md,
                backgroundColor: theme.colors.primary.subtle,
                borderRadius: theme.borderRadius.md,
                border: `2px solid ${theme.colors.primary.main}`,
              }}>
                <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.xs }}>
                  {t('search.finalScore')}
                </div>
                <div style={{ color: theme.colors.primary.main, fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold }}>
                  {selectedScoreBreakdown.breakdown.finalScore}
                </div>
                <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.xs }}>
                  {t('search.finalScoreDescription')}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedScoreBreakdown(null)}
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
      )}
    </div>
  );
};

export default Search;
