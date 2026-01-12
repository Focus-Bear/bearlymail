import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { ContextAboutMeHeader } from 'components/settings/guide-ai/ContextAboutMeHeader';
import { ContextImpactInfo } from 'components/settings/guide-ai/ContextImpactInfo';
import { AnalyzeContextButton } from 'components/settings/guide-ai/AnalyzeContextButton';
import { ContextSectionsList } from 'components/settings/guide-ai/ContextSectionsList';

interface UserContext {
  contextId: string;
  contextKey: string;
  contextValue: string;
  source: string;
  priority?: number;
  explanation?: string;
}

interface ContextAboutMeSectionProps {
  contexts: UserContext[];
  analyzing: boolean;
  addingContextType: string | null;
  editingContextId: string | null;
  editContextValue: string;
  newContextValue: string;
  onAnalyzeContext: () => Promise<void>;
  onAddContext: () => Promise<void>;
  onUpdateContext: () => Promise<void>;
  onDeleteContext: (contextId: string) => void;
  onNewContextValueChange: (value: string) => void;
  onAddingContextTypeChange: (type: string | null) => void;
  onEditingContextIdChange: (id: string | null) => void;
  onEditContextValueChange: (value: string) => void;
}

export const ContextAboutMeSection: React.FC<ContextAboutMeSectionProps> = ({
  contexts,
  analyzing,
  addingContextType,
  editingContextId,
  editContextValue,
  newContextValue,
  onAnalyzeContext,
  onAddContext,
  onUpdateContext,
  onDeleteContext,
  onNewContextValueChange,
  onAddingContextTypeChange,
  onEditingContextIdChange,
  onEditContextValueChange,
}) => {
  const { t } = useTranslation();

  return (
    <div id="context" style={{
      marginBottom: theme.spacing.xl,
      paddingBottom: theme.spacing.lg,
      borderBottom: `1px solid ${theme.colors.border.light}`,
    }}>
      <ContextAboutMeHeader />
      <ContextImpactInfo />
      <AnalyzeContextButton analyzing={analyzing} onAnalyzeContext={onAnalyzeContext} />
      
      {contexts.length === 0 && (
        <div style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
          {t('settings.noContext')}
        </div>
      )}

      <ContextSectionsList
        contexts={contexts}
        addingContextType={addingContextType}
        editingContextId={editingContextId}
        editContextValue={editContextValue}
        newContextValue={newContextValue}
        onAddContext={onAddContext}
        onUpdateContext={onUpdateContext}
        onDeleteContext={onDeleteContext}
        onNewContextValueChange={onNewContextValueChange}
        onAddingContextTypeChange={onAddingContextTypeChange}
        onEditingContextIdChange={onEditingContextIdChange}
        onEditContextValueChange={onEditContextValueChange}
      />
    </div>
  );
};

