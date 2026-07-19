import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { SummaryDebugInfo } from 'types/email';

import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { SummaryDebugPanel } from 'components/email-detail/SummaryDebugPanel';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { SUMMARY_PREVIEW_MAX_CHARS } from 'constants/numbers';
import { SUMMARY_TYPE_CUSTOM, SUMMARY_TYPE_CUSTOM_PREFIX } from 'constants/strings';

/**
 * Client-side guard against raw JSON leaking into the summary display (issue #1156).
 * Mirrors the server-side extractPlainSummary() logic as a belt-and-suspenders defence.
 */
function extractPlainSummary(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return trimmed;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object') {
      return trimmed;
    }
    if (Array.isArray(parsed)) {
      const items = (parsed as unknown[])
        .map(item => {
          if (typeof item === 'string') {
            return item;
          }
          if (typeof item === 'object' && item !== null) {
            return extractPlainSummary(JSON.stringify(item));
          }
          return String(item);
        })
        .filter(Boolean);
      return items.join('\n') || trimmed;
    }
    const parsedObj = parsed as Record<string, unknown>;
    for (const fieldName of ['summary', 'title', 'description', 'body']) {
      if (typeof parsedObj[fieldName] === 'string' && (parsedObj[fieldName] as string).trim()) {
        return (parsedObj[fieldName] as string).trim();
      }
    }
    const pairs = Object.entries(parsedObj)
      .filter(([, fieldValue]) => {
        if (typeof fieldValue === 'string') {
          return fieldValue.trim().length > 0;
        }
        return typeof fieldValue === 'number' || typeof fieldValue === 'boolean';
      })
      .map(([fieldKey, fieldValue]) => `${fieldKey}: ${String(fieldValue)}`);
    return pairs.length > 0 ? pairs.join('\n') : trimmed;
  } catch {
    return trimmed;
  }
}

interface SummarySectionProps {
  summary: string | null;
  summaryType: string;
  summaryCollapsed: boolean;
  isGeneratingSummary: boolean;
  emailIsProcessingSummary?: boolean;
  customRules: Array<{ ruleId: string; whenToUse: string; howToSummarize: string }>;
  /** Admin-only: which emails the current summary was built from. */
  summaryDebug?: SummaryDebugInfo | null;
  /** When true (admin), render the summaryDebug panel beneath the summary. */
  showDebug?: boolean;
  onSummaryTypeChange: (type: string) => void;
  onToggleCollapsed: () => void;
  onShowRuleModal: () => void;
  onUseCustomRule: (rule: { whenToUse: string; howToSummarize: string; ruleId?: string }) => void;
  /** When provided, shows a dismiss (X) button on the card header. */
  onDismiss?: () => void;
}

export const SummarySection: React.FC<SummarySectionProps> = ({
  summary,
  summaryType,
  summaryCollapsed,
  isGeneratingSummary,
  emailIsProcessingSummary,
  customRules,
  summaryDebug,
  showDebug,
  onSummaryTypeChange,
  onToggleCollapsed,
  onShowRuleModal,
  onUseCustomRule,
  onDismiss,
}) => {
  const { t } = useTranslation();

  // Defensive guard: ensure any raw JSON that slipped through server-side sanitisation
  // is converted to readable text before display (issue #1156).
  const safeSummary = summary ? extractPlainSummary(summary) : summary;

  const previewText = (() => {
    // Keep showing existing text (e.g. a deterministic placeholder) even while a
    // fresh summary is being generated, so the collapsed header never goes empty.
    if (safeSummary) {
      return (
        safeSummary.slice(0, SUMMARY_PREVIEW_MAX_CHARS) + (safeSummary.length > SUMMARY_PREVIEW_MAX_CHARS ? '…' : '')
      );
    }
    if (isGeneratingSummary || emailIsProcessingSummary) {
      return t('emailDetail.generatingSummary');
    }
    return t('emailDetail.noSummary');
  })();

  const controls = (
    <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
      <select
        value={summaryType}
        onChange={event => {
          if (event.target.value === SUMMARY_TYPE_CUSTOM) {
            onShowRuleModal();
          } else if (event.target.value.startsWith(SUMMARY_TYPE_CUSTOM_PREFIX)) {
            const ruleId = event.target.value.replace(SUMMARY_TYPE_CUSTOM_PREFIX, '');
            const rule = customRules.find(rule => rule.ruleId === ruleId);
            if (rule) {
              onSummaryTypeChange(event.target.value);
            } else {
              onSummaryTypeChange(summaryType);
            }
          } else {
            onSummaryTypeChange(event.target.value);
          }
        }}
        disabled={isGeneratingSummary}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
          backgroundColor: COLOR_NAMED_WHITE,
          cursor: isGeneratingSummary ? 'wait' : 'pointer',
        }}
      >
        <option value="tldr">{t('emailDetail.summaryTypes.tldr')}</option>
        <option value="bullet-points">{t('emailDetail.summaryTypes.bulletPoints')}</option>
        <option value="action-items">{t('emailDetail.summaryTypes.actionItems')}</option>
        <option value="sender-request">{t('emailDetail.summaryTypes.senderRequest')}</option>
        {customRules.length > 0 && (
          <optgroup label={t('emailDetail.summaryTypes.customRules')}>
            {customRules.map(rule => (
              <option key={rule.ruleId} value={`custom-${rule.ruleId}`}>
                {rule.whenToUse}
              </option>
            ))}
          </optgroup>
        )}
        <option value="custom">{t('emailDetail.createCustomRule')}...</option>
      </select>
      {isGeneratingSummary && (
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: `2px solid ${theme.colors.section.summary.accent}`,
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );

  return (
    <CollapsibleSection
      icon={<span>🤖</span>}
      title={t('emailDetail.aiSummary')}
      isCollapsed={summaryCollapsed}
      onToggle={onToggleCollapsed}
      accentColor={theme.colors.section.summary.accent}
      backgroundColor={theme.colors.section.summary.background}
      preview={previewText}
      controls={controls}
      onDismiss={onDismiss}
      dismissTitle={t('emailDetail.hideCard')}
    >
      {(() => {
        // Show existing summary text whenever we have one — even while
        // regenerating (e.g. upgrading a deterministic placeholder to an LLM
        // summary) — so the panel never flashes empty. A subtle inline hint
        // signals the refresh; the full spinner only shows when there is no
        // summary yet.
        if (safeSummary) {
          const isRefreshing = isGeneratingSummary || emailIsProcessingSummary;
          return (
            <div
              style={{
                whiteSpace: 'pre-wrap',
                color: theme.colors.text.primary,
                lineHeight: theme.typography.lineHeight.relaxed,
              }}
            >
              {safeSummary}
              {isRefreshing && (
                <div
                  style={{
                    marginTop: theme.spacing.sm,
                    fontSize: theme.typography.fontSize.xs,
                    color: theme.colors.text.secondary,
                    fontStyle: 'italic',
                  }}
                >
                  ✨ {t('emailDetail.updatingSummary')}
                </div>
              )}
            </div>
          );
        }
        if (isGeneratingSummary || emailIsProcessingSummary) {
          return (
            <div
              style={{
                padding: theme.spacing.xl,
                textAlign: 'center',
                color: theme.colors.text.secondary,
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: '24px',
                  height: '24px',
                  border: `3px solid ${theme.colors.section.summary.accent}`,
                  borderTop: '3px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: theme.spacing.md,
                }}
              />
              <div>✨ {t('emailDetail.generatingSummary')}</div>
            </div>
          );
        }
        return (
          <div
            style={{
              padding: theme.spacing.lg,
              textAlign: 'center',
              color: theme.colors.text.secondary,
              fontStyle: 'italic',
            }}
          >
            📝 {t('emailDetail.noSummary')}
          </div>
        );
      })()}
      {showDebug && summaryDebug && <SummaryDebugPanel debug={summaryDebug} />}
    </CollapsibleSection>
  );
};
