import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import {
  formatSenderAuthResults,
  getPhishingVerdict,
  PHISHING_VERDICTS,
  PhishingVerdict,
  PhishingVerdictEmail,
  splitPhishingReasons,
} from 'components/priority/tooltip/phishingVerdict.helpers';
import { EMOJI_PHISHING, EMOJI_SHIELD, EMOJI_WARNING } from 'constants/emojis';

const VERDICT_STYLES: Record<PhishingVerdict, { emoji: string; color: string; background: string }> = {
  [PHISHING_VERDICTS.PHISHING]: {
    emoji: EMOJI_PHISHING,
    color: theme.colors.error.dark,
    background: theme.colors.error.light,
  },
  [PHISHING_VERDICTS.SUSPICIOUS]: {
    emoji: EMOJI_WARNING,
    color: theme.colors.text.primary,
    background: theme.colors.warning.light,
  },
  [PHISHING_VERDICTS.SAFE]: {
    emoji: EMOJI_SHIELD,
    color: theme.colors.text.primary,
    background: theme.colors.success.light,
  },
  [PHISHING_VERDICTS.NOT_CHECKED]: {
    emoji: EMOJI_SHIELD,
    color: theme.colors.text.secondary,
    background: theme.colors.background.subtle,
  },
};

const labelStyle: React.CSSProperties = {
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.secondary,
};

interface PriorityTooltipPhishingProps {
  email: PhishingVerdictEmail;
}

/**
 * The phishing decision for an email, shown in the priority popover so the
 * user can see why an email was (or wasn't) flagged without opening it.
 */
export const PriorityTooltipPhishing: React.FC<PriorityTooltipPhishingProps> = ({ email }) => {
  const { t } = useTranslation();
  const headingId = useId();
  const verdict = getPhishingVerdict(email);
  const verdictStyle = VERDICT_STYLES[verdict];
  const reasons = splitPhishingReasons(email.phishingReason);
  const senderChecks = formatSenderAuthResults(email.senderAuthResults);

  return (
    <section
      aria-labelledby={headingId}
      data-testid="priority-tooltip-phishing"
      data-verdict={verdict}
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        borderRadius: theme.borderRadius.sm,
        backgroundColor: verdictStyle.background,
        color: verdictStyle.color,
        lineHeight: '1.4',
      }}
    >
      <h4 id={headingId} style={{ margin: 0, fontSize: theme.typography.fontSize.sm }}>
        <span aria-hidden>{verdictStyle.emoji} </span>
        {t('priority.tooltip.phishing.heading')}: {t(`priority.tooltip.phishing.verdict.${verdict}`)}
      </h4>
      {email.phishingConfidence && (
        <div style={{ marginTop: theme.spacing.xs }}>
          <span style={labelStyle}>{t('phishing.confidence')}:</span>{' '}
          {t(`phishing.confidenceLevel.${email.phishingConfidence}`)}
        </div>
      )}
      {reasons.length > 0 ? (
        <div style={{ marginTop: theme.spacing.xs }}>
          <span style={labelStyle}>{t('priority.tooltip.phishing.why')}</span>
          <ul style={{ margin: `${theme.spacing.xs} 0 0`, paddingLeft: theme.spacing.lg }}>
            {reasons.map(reason => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ marginTop: theme.spacing.xs }}>{t(`priority.tooltip.phishing.explanation.${verdict}`)}</div>
      )}
      {senderChecks && (
        <div style={{ marginTop: theme.spacing.xs }}>
          <span style={labelStyle}>{t('priority.tooltip.phishing.senderChecks')}:</span> {senderChecks}
        </div>
      )}
    </section>
  );
};
