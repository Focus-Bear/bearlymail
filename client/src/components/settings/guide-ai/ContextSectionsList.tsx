import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ConfirmModal } from 'components/ConfirmModal';
import { ContextSection } from 'components/settings/guide-ai/ContextSection';
import { ProtoCategoriesModal } from 'components/settings/guide-ai/ProtoCategoriesModal';
import { RecategorizeProgressBar } from 'components/settings/RecategorizeProgressBar';
import { API_URL } from 'config/api';
import { OPACITY_DISABLED } from 'constants/numbers';
import { CONTEXT_KEY_EMAIL_CATEGORY, STRING_NONE } from 'constants/strings';
import { useNotifications } from 'contexts/NotificationContext';
import { RecategorizeProgressState, useRecategorizeProgress } from 'hooks/settings/useRecategorizeProgress';

const CONSOLIDATE_RELOAD_DELAY_MS = 1500;

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
  onRefreshContexts?: () => void;
}

interface ContextSectionConfig {
  titleKey?: string;
  title?: string;
  contextKey: string | string[];
  addLabelKey?: string;
  addLabel?: string;
  tooltipKey: string;
  anchorId?: string;
}

const CONTEXT_SECTIONS: ContextSectionConfig[] = [
  {
    titleKey: 'settings.contextSections.emailCategories',
    contextKey: 'EMAIL_CATEGORY',
    addLabelKey: 'settings.addContext.emailCategories',
    tooltipKey: 'settings.contextTypes.tooltip.emailCategories',
    anchorId: 'email-categories',
  },
  {
    titleKey: 'settings.contextSections.vip',
    contextKey: 'VIP_CONTACT',
    addLabelKey: 'settings.addContext.vip',
    tooltipKey: 'settings.contextTypes.tooltip.vip',
  },
  {
    titleKey: 'settings.contextSections.userInfo',
    contextKey: 'USER_INFO',
    addLabelKey: 'settings.addContext.userInfo',
    tooltipKey: 'settings.contextTypes.tooltip.userInfo',
  },
  {
    titleKey: 'settings.contextSections.projects',
    contextKey: ['CURRENT_TOPIC', 'PROJECT_NAME', 'WORKING_ON'],
    addLabelKey: 'settings.addContext.projects',
    tooltipKey: 'settings.contextTypes.tooltip.projects',
  },
  {
    titleKey: 'settings.contextSections.urgent',
    contextKey: 'URGENT',
    addLabelKey: 'settings.addContext.urgent',
    tooltipKey: 'settings.contextTypes.tooltip.urgent',
  },
  {
    titleKey: 'settings.contextSections.notImportant',
    contextKey: 'NOT_IMPORTANT',
    addLabelKey: 'settings.addContext.notImportant',
    tooltipKey: 'settings.contextTypes.tooltip.notImportant',
  },
  {
    title: 'Q&A',
    contextKey: 'Q_AND_A',
    addLabel: 'Add common Q&A',
    tooltipKey: 'settings.contextTypes.tooltip.qanda',
  },
];

interface CategoryActionsState {
  isRecategorizing: boolean;
  isConsolidating: boolean;
  isCompressing: boolean;
  compressComplete: boolean;
  showProtoCategoriesModal: boolean;
  showConsolidateConfirm: boolean;
  recategorizeProgress: RecategorizeProgressState;
  dismissProgress: () => void;
  setShowProtoCategoriesModal: (show: boolean) => void;
  setShowConsolidateConfirm: (show: boolean) => void;
  handleRecategorize: () => Promise<void>;
  handleConsolidateConfirmed: () => Promise<void>;
  handleCompressContext: () => Promise<void>;
}

function useCategoryActions(onRefreshContexts?: () => void): CategoryActionsState {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressComplete, setCompressComplete] = useState(false);
  const [showProtoCategoriesModal, setShowProtoCategoriesModal] = useState(false);
  const [showConsolidateConfirm, setShowConsolidateConfirm] = useState(false);
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

  const handleConsolidateConfirmed = async () => {
    setShowConsolidateConfirm(false);
    setIsConsolidating(true);
    try {
      await axios.post(`${API_URL}/context/consolidate-categories`);
      showSuccess(t('settings.emailCategories.consolidateSuccess'));
      setTimeout(() => window.location.reload(), CONSOLIDATE_RELOAD_DELAY_MS);
    } catch (error) {
      console.error('Failed to consolidate categories:', error);
      showError(t('settings.emailCategories.consolidateError'));
    } finally {
      setIsConsolidating(false);
    }
  };

  const handleCompressContext = async () => {
    setIsCompressing(true);
    setCompressComplete(false);
    try {
      await axios.post(`${API_URL}/context/compress`);
      setCompressComplete(true);
      showSuccess(t('settings.context.compressSuccess'));
      onRefreshContexts?.();
    } catch (error) {
      console.error('Failed to compress context:', error);
      showError(t('settings.context.compressError'));
    } finally {
      setIsCompressing(false);
    }
  };

  return {
    isRecategorizing,
    isConsolidating,
    isCompressing,
    compressComplete,
    showProtoCategoriesModal,
    showConsolidateConfirm,
    recategorizeProgress,
    dismissProgress,
    setShowProtoCategoriesModal,
    setShowConsolidateConfirm,
    handleRecategorize,
    handleConsolidateConfirmed,
    handleCompressContext,
  };
}

/** Minimum number of context items before the compress banner is shown. */
const COMPRESS_CONTEXT_THRESHOLD = 30;

const ghostButtonStyle = (disabled: boolean, color: string): React.CSSProperties => ({
  background: 'transparent',
  border: STRING_NONE,
  color,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  opacity: disabled ? OPACITY_DISABLED : 1,
});

interface CompressStatusBadgeProps {
  isCompressing: boolean;
  compressComplete: boolean;
}

const CompressStatusBadge: React.FC<CompressStatusBadgeProps> = ({ isCompressing, compressComplete }) => {
  const { t } = useTranslation();
  if (!isCompressing && !compressComplete) {
    return null;
  }
  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      {isCompressing && (
        <span
          style={{
            width: '12px',
            height: '12px',
            flexShrink: 0,
            border: `2px solid ${theme.colors.primary.main}`,
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            display: 'inline-block',
          }}
        />
      )}
      {compressComplete && !isCompressing && <span>✅</span>}
      <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
        {isCompressing ? t('settings.context.compressing') : t('settings.context.compressSuccess')}
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

interface EmailCategoryControlsProps {
  actions: CategoryActionsState;
}

const EmailCategoryControls: React.FC<EmailCategoryControlsProps> = ({ actions }) => {
  const { t } = useTranslation();
  const {
    isConsolidating, isRecategorizing,
    recategorizeProgress, dismissProgress, showProtoCategoriesModal,
    setShowProtoCategoriesModal, handleConsolidateCategories,
    handleRecategorize,
  } = actions as CategoryActionsState & { handleConsolidateCategories: () => void };

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <button onClick={() => setShowProtoCategoriesModal(true)} style={ghostButtonStyle(false, theme.colors.primary.main)}>
        {t('settings.protoCategories.viewButton')}
      </button>
      <button onClick={handleConsolidateCategories} disabled={isConsolidating} style={ghostButtonStyle(isConsolidating, theme.colors.primary.main)}>
        {isConsolidating ? t('settings.emailCategories.consolidating') : t('settings.emailCategories.consolidate')}
      </button>
      <button onClick={handleRecategorize} disabled={isRecategorizing} style={ghostButtonStyle(isRecategorizing, theme.colors.accent.warning)}>
        {isRecategorizing ? t('settings.emailCategories.recategorizing') : t('settings.emailCategories.recategorize')}
      </button>
      <RecategorizeProgressBar progress={recategorizeProgress} onDismiss={dismissProgress} />
      {showProtoCategoriesModal && <ProtoCategoriesModal onClose={() => setShowProtoCategoriesModal(false)} />}
    </div>
  );
};

interface CompressContextBannerProps {
  actions: CategoryActionsState;
}

/**
 * Shown at the top of the context list when the context item count exceeds COMPRESS_CONTEXT_THRESHOLD.
 * Lets the user compress context without navigating to the email categories section.
 */
const CompressContextBanner: React.FC<CompressContextBannerProps> = ({ actions }) => {
  const { t } = useTranslation();
  const { isCompressing, compressComplete, handleCompressContext } = actions;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        padding: theme.spacing.sm,
        marginBottom: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, flex: 1 }}>
        {t('settings.context.compressBannerMessage')}
      </span>
      <button
        onClick={handleCompressContext}
        disabled={isCompressing}
        style={ghostButtonStyle(isCompressing, theme.colors.primary.main)}
      >
        {isCompressing ? t('settings.context.compressing') : t('settings.context.compress')}
      </button>
      <CompressStatusBadge isCompressing={isCompressing} compressComplete={compressComplete} />
    </div>
  );
};

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
  onRefreshContexts,
}) => {
  const { t } = useTranslation();
  const actions = useCategoryActions(onRefreshContexts);
  const { showConsolidateConfirm, setShowConsolidateConfirm, handleConsolidateConfirmed } = actions;

  const commonProps = {
    contexts, addingContextType, editingContextId, editContextValue, newContextValue,
    onAddContext, onUpdateContext, onDeleteContext, onNewContextValueChange,
    onAddingContextTypeChange, onEditingContextIdChange, onEditContextValueChange,
  };

  const actionsWithConsolidate = {
    ...actions,
    handleConsolidateCategories: () => setShowConsolidateConfirm(true),
  };

  const shouldShowCompressBanner = contexts.length > COMPRESS_CONTEXT_THRESHOLD;

  return (
    <>
      <ConfirmModal
        isOpen={showConsolidateConfirm}
        title={t('settings.emailCategories.consolidate')}
        message={t('settings.emailCategories.consolidateConfirm')}
        confirmLabel={t('settings.emailCategories.consolidate')}
        cancelLabel={t('common.cancel')}
        icon="🔀"
        onConfirm={handleConsolidateConfirmed}
        onCancel={() => setShowConsolidateConfirm(false)}
      />
      {shouldShowCompressBanner && <CompressContextBanner actions={actions} />}
      {CONTEXT_SECTIONS.map(config => {
        const contextKeyStr = Array.isArray(config.contextKey) ? config.contextKey.join('-') : config.contextKey;
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
            actionButton={isEmailCategory ? <EmailCategoryControls actions={actionsWithConsolidate as any} /> : undefined}
            isInitiallyExpanded={isAnchoredMatch}
            {...commonProps}
          />
        );
        if (config.anchorId) {
          return <div key={key} id={config.anchorId}>{sectionElement}</div>;
        }
        return sectionElement;
      })}
    </>
  );
};
