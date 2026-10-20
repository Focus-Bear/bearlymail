import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { RuleSimulationStats } from './autoArchiveProposals.api';

const PERCENT = 100;

interface ProposalImpactProps {
  stats: RuleSimulationStats;
  windowDays: number;
  /** Emails from the sender in the window, for context. */
  senderTotal: number;
}

/**
 * What the rule would have done over the look-back window: how much it would
 * have archived, how much of that the user opened, and — the safeguard — how
 * many emails they opened or replied to it would have hidden.
 */
export const ProposalImpact: React.FC<ProposalImpactProps> = ({ stats, windowDays, senderTotal }) => {
  const { t } = useTranslation();
  const openedPercent = stats.matched > 0 ? Math.round((stats.opened / stats.matched) * PERCENT) : 0;
  const engagedCaught = stats.engaged;
  const isSafe = engagedCaught === 0;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }} data-testid="proposal-impact">
      <Stat
        label={t('settings.autoArchive.impact.matchedLabel', { days: windowDays })}
        value={t('settings.autoArchive.impact.matchedValue', { count: stats.matched, total: senderTotal })}
      />
      <Stat label={t('settings.autoArchive.impact.openedLabel')} value={`${openedPercent}%`} />
      <Stat
        label={t('settings.autoArchive.impact.engagedLabel')}
        value={
          isSafe
            ? t('settings.autoArchive.impact.engagedNone')
            : t('settings.autoArchive.impact.engagedSome', { count: engagedCaught, replied: stats.replied })
        }
        tone={isSafe ? 'safe' : 'warning'}
      />
    </div>
  );
};

type StatTone = 'neutral' | 'safe' | 'warning';

const TONE_COLORS: Record<StatTone, { background: string; text: string }> = {
  neutral: { background: theme.colors.background.subtle, text: theme.colors.text.primary },
  safe: { background: theme.colors.success.light, text: theme.colors.text.primary },
  warning: { background: theme.colors.warning.light, text: theme.colors.text.primary },
};

const Stat: React.FC<{ label: string; value: string; tone?: StatTone }> = ({ label, value, tone = 'neutral' }) => (
  <div
    style={{
      flex: '1 1 160px',
      padding: '8px 12px',
      borderRadius: theme.borderRadius.md,
      background: TONE_COLORS[tone].background,
      color: TONE_COLORS[tone].text,
    }}
  >
    <div style={{ ...theme.typography.body.small, color: theme.colors.text.tertiary }}>{label}</div>
    <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{value}</div>
  </div>
);
