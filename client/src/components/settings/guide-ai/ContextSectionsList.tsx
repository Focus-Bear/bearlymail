import React from 'react';
import { useTranslation } from 'react-i18next';
import { ContextSection } from 'components/settings/guide-ai/ContextSection';

interface UserContext {
  contextId: string;
  contextKey: string;
  contextValue: string;
  source: string;
  priority?: number;
  explanation?: string;
}

interface ContextSectionsListProps {
  contexts: UserContext[];
  addingContextType: string | null;
  editingContextId: string | null;
  editContextValue: string;
  newContextValue: string;
  onAddContext: () => Promise<void>;
  onUpdateContext: () => Promise<void>;
  onDeleteContext: (contextId: string) => void;
  onNewContextValueChange: (value: string) => void;
  onAddingContextTypeChange: (type: string | null) => void;
  onEditingContextIdChange: (id: string | null) => void;
  onEditContextValueChange: (value: string) => void;
}

interface ContextSectionConfig {
  titleKey?: string;
  title?: string;
  contextKey: string | string[];
  addLabelKey?: string;
  addLabel?: string;
  tooltipKey: string;
}

const CONTEXT_SECTIONS: ContextSectionConfig[] = [
  { titleKey: 'settings.contextSections.vip', contextKey: 'VIP_CONTACT', addLabelKey: 'settings.addContext.vip', tooltipKey: 'settings.contextTypes.tooltip.vip' },
  { titleKey: 'settings.contextSections.userInfo', contextKey: 'USER_INFO', addLabelKey: 'settings.addContext.userInfo', tooltipKey: 'settings.contextTypes.tooltip.userInfo' },
  { titleKey: 'settings.contextSections.projects', contextKey: ['CURRENT_TOPIC', 'PROJECT_NAME', 'WORKING_ON'], addLabelKey: 'settings.addContext.projects', tooltipKey: 'settings.contextTypes.tooltip.projects' },
  { titleKey: 'settings.contextSections.urgent', contextKey: 'URGENT', addLabelKey: 'settings.addContext.urgent', tooltipKey: 'settings.contextTypes.tooltip.urgent' },
  { titleKey: 'settings.contextSections.notImportant', contextKey: 'NOT_IMPORTANT', addLabelKey: 'settings.addContext.notImportant', tooltipKey: 'settings.contextTypes.tooltip.notImportant' },
  { title: 'Q&A', contextKey: 'Q_AND_A', addLabel: 'Add common Q&A', tooltipKey: 'settings.contextTypes.tooltip.qanda' },
  // Removed "Other Context" section - it was showing garbage data
];

export const ContextSectionsList: React.FC<ContextSectionsListProps> = ({
  contexts,
  addingContextType,
  editingContextId,
  editContextValue,
  newContextValue,
  onAddContext,
  onUpdateContext,
  onDeleteContext,
  onNewContextValueChange,
  onAddingContextTypeChange,
  onEditingContextIdChange,
  onEditContextValueChange,
}) => {
  const { t } = useTranslation();

  const commonProps = {
    contexts,
    addingContextType,
    editingContextId,
    editContextValue,
    newContextValue,
    onAddContext,
    onUpdateContext,
    onDeleteContext,
    onNewContextValueChange,
    onAddingContextTypeChange,
    onEditingContextIdChange,
    onEditContextValueChange,
  };

  return (
    <>
      {CONTEXT_SECTIONS.map((config) => {
        const contextKeyStr = Array.isArray(config.contextKey) 
          ? config.contextKey.join('-') 
          : config.contextKey;
        const key = `context-section-${contextKeyStr}`;
        return (
          <ContextSection
            key={key}
            title={config.title || (config.titleKey ? t(config.titleKey) : '')}
            contextKey={config.contextKey}
            addLabel={config.addLabel || (config.addLabelKey ? t(config.addLabelKey) : '')}
            tooltipContent={t(config.tooltipKey)}
            {...commonProps}
          />
        );
      })}
    </>
  );
};

