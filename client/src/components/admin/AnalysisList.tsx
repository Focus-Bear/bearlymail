import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { STATUS_FAILED } from 'constants/strings';

import { AnalysisCardClickableHeader } from './AnalysisCardClickableHeader';
import { AnalysisCardExpandedContent } from './AnalysisCardExpandedContent';
import { ContextAnalysisItem } from './ContextAnalysisSection.types';

interface AnalysisCardProps {
  analysis: ContextAnalysisItem;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

/**
 * Renders a collapsible card for a single context analysis run. Cards with
 * failures or an error message can be expanded to reveal batch-level details.
 */
const AnalysisCard: React.FC<AnalysisCardProps> = ({ analysis, expandedId, setExpandedId, copiedId, onCopy }) => {
  const isExpanded = expandedId === analysis.id;
  const canExpand = analysis.failedBatches > 0 || !!analysis.errorMessage;
  const handleToggle = () => {
    if (canExpand) {
      setExpandedId(isExpanded ? null : analysis.id);
    }
  };
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${analysis.status === STATUS_FAILED ? theme.colors.accent.error : theme.colors.border.light}`,
        overflow: 'hidden',
      }}
    >
      <AnalysisCardClickableHeader
        analysis={analysis}
        isExpanded={isExpanded}
        canExpand={canExpand}
        copiedId={copiedId}
        onCopy={onCopy}
        onToggle={handleToggle}
      />
      {isExpanded && <AnalysisCardExpandedContent analysis={analysis} copiedId={copiedId} onCopy={onCopy} />}
    </div>
  );
};

interface AnalysisListProps {
  analyses: ContextAnalysisItem[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

/**
 * Renders the full list of context analysis cards, or an empty-state message
 * when no analyses match the current filter.
 */
export const AnalysisList: React.FC<AnalysisListProps> = ({
  analyses,
  expandedId,
  setExpandedId,
  copiedId,
  onCopy,
}) => {
  const { t } = useTranslation();

  if (analyses.length === 0) {
    return (
      <div
        style={{
          padding: theme.spacing.xl,
          textAlign: 'center',
          color: theme.colors.text.secondary,
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        {t('admin.contextAnalysis.noAnalyses')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {analyses.map(analysis => (
        <AnalysisCard
          key={analysis.id}
          analysis={analysis}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          copiedId={copiedId}
          onCopy={onCopy}
        />
      ))}
    </div>
  );
};
