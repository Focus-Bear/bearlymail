import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ContextSection } from 'components/settings/guide-ai/ContextSection';
import { ProtoCategoriesModal } from 'components/settings/guide-ai/ProtoCategoriesModal';
import { RecategorizeProgressBar } from 'components/settings/RecategorizeProgressBar';
import { API_URL } from 'config/api';
import { OPACITY_DISABLED } from 'constants/numbers';
import { CONTEXT_KEY_EMAIL_CATEGORY, STRING_NONE } from 'constants/strings';
import { useRecategorizeProgress } from 'hooks/settings/useRecategorizeProgress';

interface UserContext { contextId: string; contextKey: string; contextValue: string; source: string; priority?: number; explanation?: string; }

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

interface ContextSectionConfig { titleKey?: string; title?: string; contextKey: string | string[]; addLabelKey?: string; addLabel?: string; tooltipKey: string; anchorId?: string; }

const CONTEXT_SECTIONS: ContextSectionConfig[] = [ { titleKey: 'settings.contextSections.emailCategories', contextKey: 'EMAIL_CATEGORY', addLabelKey: 'settings.addContext.emailCategories', tooltipKey: 'settings.contextTypes.tooltip.emailCategories', anchorId: 'email-categories' }, { titleKey: 'settings.contextSections.vip', contextKey: 'VIP_CONTACT', addLabelKey: 'settings.addContext.vip', tooltipKey: 'settings.contextTypes.tooltip.vip' }, { titleKey: 'settings.contextSections.userInfo', contextKey: 'USER_INFO', addLabelKey: 'settings.addContext.userInfo', tooltipKey: 'settings.contextTypes.tooltip.userInfo' }, { titleKey: 'settings.contextSections.projects', contextKey: ['CURRENT_TOPIC', 'PROJECT_NAME', 'WORKING_ON'], addLabelKey: 'settings.addContext.projects', tooltipKey: 'settings.contextTypes.tooltip.projects' }, { titleKey: 'settings.contextSections.urgent', contextKey: 'URGENT', addLabelKey: 'settings.addContext.urgent', tooltipKey: 'settings.contextTypes.tooltip.urgent' }, { titleKey: 'settings.contextSections.notImportant', contextKey: 'NOT_IMPORTANT', addLabelKey: 'settings.addContext.notImportant', tooltipKey: 'settings.contextTypes.tooltip.notImportant' }, { title: 'Q&A', contextKey: 'Q_AND_A', addLabel: 'Add common Q&A', tooltipKey: 'settings.contextTypes.tooltip.qanda' }, ];

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
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showProtoCategoriesModal, setShowProtoCategoriesModal] = useState(false);

  const { progress: recategorizeProgress, startTracking, dismiss: dismissProgress } = useRecategorizeProgress();

  const handleRecategorize = async () => {
    setIsRecategorizing(true);
    try {
      const response = await axios.post(`${API_URL}/emails/recategorize-triage`);
      const { batchId, queued } = response.data as { batchId: string | null; queued: number };
      if (batchId && queued > 0) {
        startTracking(batchId, queued);
      }
    } catch (error) {
      console.error('Failed to recategorize emails:', error);
    } finally {
      setIsRecategorizing(false);
    }
  };

  const handleConsolidateCategories = async () => {
    setIsConsolidating(true);
    try {
      await axios.post(`${API_URL}/context/consolidate-categories`);
      // Reload the page to show updated categories
      window.location.reload();
    } catch (error) {
      console.error('Failed to consolidate categories:', error);
    } finally {
      setIsConsolidating(false);
    }
  };


  const handleCompressContext = async () => {
    setIsCompressing(true);
    try {
      await axios.post(`${API_URL}/context/compress`);
    } catch (error) {
      console.error('Failed to compress context:', error);
    } finally {
      setIsCompressing(false);
    }
  };

  const commonProps = { contexts, addingContextType, editingContextId, editContextValue, newContextValue, onAddContext, onUpdateContext, onDeleteContext, onNewContextValueChange, onAddingContextTypeChange, onEditingContextIdChange, onEditContextValueChange, };

  const EmailCategoryControls: React.FC = () => (
    <div style={{ marginLeft: 'auto', minWidth: '260px' }}>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={() => setShowProtoCategoriesModal(true)} style={{ background: 'transparent', border: STRING_NONE, color: theme.colors.primary.main, cursor: 'pointer', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium }}>{t('settings.protoCategories.viewButton')}</button>
        <button onClick={handleCompressContext} disabled={isCompressing} style={{ background: 'transparent', border: STRING_NONE, color: theme.colors.primary.main, cursor: 'pointer', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium, opacity: isCompressing ? OPACITY_DISABLED : 1 }}>{isCompressing ? t('settings.context.compressing') : t('settings.context.compress')}</button>
        <button onClick={handleConsolidateCategories} disabled={isConsolidating} style={{ background: 'transparent', border: STRING_NONE, color: theme.colors.primary.main, cursor: isConsolidating ? 'not-allowed' : 'pointer', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium, opacity: isConsolidating ? OPACITY_DISABLED : 1 }}>{isConsolidating ? t('settings.emailCategories.consolidating') : t('settings.emailCategories.consolidate')}</button>
        <button onClick={handleRecategorize} disabled={isRecategorizing} style={{ background: 'transparent', border: STRING_NONE, color: theme.colors.accent.warning, cursor: isRecategorizing ? 'not-allowed' : 'pointer', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium, opacity: isRecategorizing ? OPACITY_DISABLED : 1 }}>{isRecategorizing ? t('settings.emailCategories.recategorizing') : t('settings.emailCategories.recategorize')}</button>
      </div>
      <RecategorizeProgressBar progress={recategorizeProgress} onDismiss={dismissProgress} />
      {showProtoCategoriesModal && <ProtoCategoriesModal onClose={() => setShowProtoCategoriesModal(false)} />}
    </div>
  );

  return (
    <>
      {CONTEXT_SECTIONS.map((config) => {
        const contextKeyStr = Array.isArray(config.contextKey) 
          ? config.contextKey.join('-') 
          : config.contextKey;
        const key = `context-section-${contextKeyStr}`;
        const isEmailCategory = contextKeyStr === CONTEXT_KEY_EMAIL_CATEGORY;
        const isAnchoredMatch = Boolean(config.anchorId && window.location.hash === `#${config.anchorId}`);
        const sectionElement = (
          <ContextSection
            key={key}
            title={config.title || (config.titleKey ? t(config.titleKey) : '')}
            contextKey={config.contextKey}
            addLabel={config.addLabel || (config.addLabelKey ? t(config.addLabelKey) : '')}
            tooltipContent={t(config.tooltipKey)}
            actionButton={isEmailCategory ? <EmailCategoryControls /> : undefined}
            isInitiallyExpanded={isAnchoredMatch}
            {...commonProps}
          />
        );
        if (config.anchorId) {
          return (
            <div key={key} id={config.anchorId}>
              {sectionElement}
            </div>
          );
        }
        return sectionElement;
      })}
    </>
  );
};


