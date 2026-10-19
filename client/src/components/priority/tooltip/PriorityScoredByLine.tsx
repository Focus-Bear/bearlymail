import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { AiDecisionProvider, PriorityScoreSource } from 'types/email';

import { getPrioritySourceLabelKey } from 'components/priority/tooltip/decisionSourceLabels';

interface PriorityScoredByLineProps {
  source: PriorityScoreSource;
  provider?: AiDecisionProvider | null;
}

/** "Priority scored by: LLM (Gemini)" — names the engine behind the score. */
export const PriorityScoredByLine: React.FC<PriorityScoredByLineProps> = ({ source, provider }) => {
  const { t } = useTranslation();
  return (
    <div
      data-testid="priority-scored-by"
      style={{
        marginBottom: theme.spacing.sm,
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.tertiary,
      }}
    >
      {t('priority.tooltip.scoredBy.label', { sourceLabel: t(getPrioritySourceLabelKey(source, provider)) })}
    </div>
  );
};
