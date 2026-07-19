import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiMoreVertical } from 'react-icons/fi';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ConfirmModal } from 'components/ConfirmModal';
import { ContextSection } from 'components/settings/guide-ai/ContextSection';
import { ProtoCategoriesModal } from 'components/settings/guide-ai/ProtoCategoriesModal';
import { QAndASection } from 'components/settings/guide-ai/QAndASection';
import { RecategorizeProgressBar } from 'components/settings/RecategorizeProgressBar';
import { API_URL } from 'config/api';
import { OPACITY_DISABLED } from 'constants/numbers';
import { CONTEXT_KEY_EMAIL_CATEGORY, CONTEXT_KEY_Q_AND_A, STRING_NONE } from 'constants/strings';
import { useNotifications } from 'contexts/NotificationContext';
import { RecategorizeProgressState, useRecategorizeProgress } from 'hooks/settings/useRecategorizeProgress';

const CONSOLIDATE_RELOAD_DELAY_MS = 1500;
const CONSOLIDATE_POLL_INTERVAL_MS = 2000;
const CONSOLIDATE_POLL_MAX_ATTEMPTS = 90; // ~3 minutes
// Deep-link (`?category=`) scroll-to-category: the section expands from the
// #email-categories hash and its rows render after contexts load, so we poll
// briefly for the target row, then scroll to it and flash a highlight.
const DEEP_LINK_INITIAL_DELAY_MS = 300;
const DEEP_LINK_POLL_MS = 150;
const DEEP_LINK_TIMEOUT_MS = 4000;
const DEEP_LINK_HIGHLIGHT_MS = 2200;

/**
 * When the email-categories section is opened with a `?category=<name>` deep
 * link (from the inbox category ⚙️ button), scrolls that category's row into
 * view and flashes a highlight. Polls briefly because the section expands from
 * the URL hash and its rows render only after the contexts load.
 */
function useScrollToDeepLinkedCategory(targetCategory: string | null): void {
  useEffect(() => {
    if (!targetCategory) {
      return undefined;
    }
    let cancelled = false;
    let pollTimer: number | undefined;
    let highlightTimer: number | undefined;
    const deadline = Date.now() + DEEP_LINK_TIMEOUT_MS;
    const escape = window.CSS?.escape ?? ((value: string) => value);
    const selector = `[data-category-name="${escape(targetCategory)}"]`;
    const tryScroll = () => {
      if (cancelled) {
        return;
      }
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'box-shadow 0.3s ease';
        el.style.boxShadow = `0 0 0 2px ${theme.colors.primary.main}`;
        highlightTimer = window.setTimeout(() => {
          el.style.boxShadow = '';
        }, DEEP_LINK_HIGHLIGHT_MS);
        return;
      }
      if (Date.now() < deadline) {
        pollTimer = window.setTimeout(tryScroll, DEEP_LINK_POLL_MS);
      }
    };
    const initialTimer = window.setTimeout(tryScroll, DEEP_LINK_INITIAL_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      if (pollTimer) {
        window.clearTimeout(pollTimer);
      }
      if (highlightTimer) {
        window.clearTimeout(highlightTimer);
      }
    };
  }, [targetCategory]);
}
const RUN_STATUS_COMPLETED = 'completed';
const RUN_STATUS_FAILED = 'failed';

interface ConsolidationRunResult {
  mergedCount?: number;
  prunedCount?: number;
}

/**
 * Polls a background consolidation run until it completes or fails. Returns the
 * run's summary on success, or null if it failed or did not finish in time.
 */
async function pollConsolidationRun(
  runId: string,
): Promise<ConsolidationRunResult | null> {
  for (let attempt = 0; attempt < CONSOLIDATE_POLL_MAX_ATTEMPTS; attempt += 1) {
    await new Promise(resolve => {
      setTimeout(resolve, CONSOLIDATE_POLL_INTERVAL_MS);
    });
    const { data } = await axios.get(
      `${API_URL}/context/consolidation-runs/${runId}`,
    );
    if (data?.status === RUN_STATUS_COMPLETED) {
      return (data.result as ConsolidationRunResult) ?? {};
    }
    if (data?.status === RUN_STATUS_FAILED) {
      return null;
    }
  }
  return null;
}

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
    titleKey: 'settings.contextSections.qanda',
    contextKey: CONTEXT_KEY_Q_AND_A,
    addLabelKey: 'settings.addContext.qa',
    tooltipKey: 'settings.contextTypes.tooltip.qanda',
  },
];

interface CategoryActionsState {
  isRecategorizing: boolean;
  isConsolidating: boolean;
  isPruning: boolean;
  isCompressing: boolean;
  compressComplete: boolean;
  showProtoCategoriesModal: boolean;
  showConsolidateConfirm: boolean;
  showPruneConfirm: boolean;
  unusedCategories: string[];
  recategorizeProgress: RecategorizeProgressState;
  dismissProgress: () => void;
  setShowProtoCategoriesModal: (show: boolean) => void;
  setShowConsolidateConfirm: (show: boolean) => void;
  setShowPruneConfirm: (show: boolean) => void;
  handleRecategorize: () => Promise<void>;
  handleConsolidateConfirmed: () => Promise<void>;
  handleOpenPruneModal: () => Promise<void>;
  handlePruneConfirmed: () => Promise<void>;
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
  const [isPruning, setIsPruning] = useState(false);
  const [showPruneConfirm, setShowPruneConfirm] = useState(false);
  const [unusedCategories, setUnusedCategories] = useState<string[]>([]);
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
      // Consolidation runs in the background; enqueue then poll for the result.
      const { data } = await axios.post(
        `${API_URL}/context/consolidate-categories`,
      );
      const runId = data?.runId as string | undefined;
      const result = runId ? await pollConsolidationRun(runId) : null;
      if (!result) {
        showError(t('settings.emailCategories.consolidateError'));
        return;
      }
      const merged = result.mergedCount ?? 0;
      const pruned = result.prunedCount ?? 0;
      if (merged === 0 && pruned === 0) {
        showSuccess(t('settings.emailCategories.consolidateNoChanges'));
      } else {
        showSuccess(
          t('settings.emailCategories.consolidateSuccess', { merged, pruned }),
        );
      }
      setTimeout(() => window.location.reload(), CONSOLIDATE_RELOAD_DELAY_MS);
    } catch (error) {
      console.error('Failed to consolidate categories:', error);
      showError(t('settings.emailCategories.consolidateError'));
    } finally {
      setIsConsolidating(false);
    }
  };

  const handleOpenPruneModal = async () => {
    setIsPruning(true);
    try {
      const { data } = await axios.get(`${API_URL}/context/unused-categories`);
      const names = ((data ?? []) as Array<{ name: string }>).map(
        category => category.name,
      );
      if (names.length === 0) {
        showSuccess(t('settings.emailCategories.pruneNoneFound'));
        return;
      }
      setUnusedCategories(names);
      setShowPruneConfirm(true);
    } catch (error) {
      console.error('Failed to load unused categories:', error);
      showError(t('settings.emailCategories.pruneError'));
    } finally {
      setIsPruning(false);
    }
  };

  const handlePruneConfirmed = async () => {
    setShowPruneConfirm(false);
    setIsPruning(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/context/prune-unused-categories`,
      );
      const count = data?.prunedCount ?? 0;
      showSuccess(t('settings.emailCategories.pruneSuccess', { count }));
      setTimeout(() => window.location.reload(), CONSOLIDATE_RELOAD_DELAY_MS);
    } catch (error) {
      console.error('Failed to prune unused categories:', error);
      showError(t('settings.emailCategories.pruneError'));
    } finally {
      setIsPruning(false);
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
    isPruning,
    isCompressing,
    compressComplete,
    showProtoCategoriesModal,
    showConsolidateConfirm,
    showPruneConfirm,
    unusedCategories,
    recategorizeProgress,
    dismissProgress,
    setShowProtoCategoriesModal,
    setShowConsolidateConfirm,
    setShowPruneConfirm,
    handleRecategorize,
    handleConsolidateConfirmed,
    handleOpenPruneModal,
    handlePruneConfirmed,
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

/**
 * Overflow ⋮ menu for email-category actions.
 *
 * Shown on ALL viewport sizes — no responsive breakpoint switching.
 * Items: View proto-categories | Consolidate categories | Recategorize
 */
const EmailCategoryControls: React.FC<EmailCategoryControlsProps> = ({ actions }) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    isConsolidating,
    isPruning,
    isRecategorizing,
    recategorizeProgress,
    dismissProgress,
    showProtoCategoriesModal,
    setShowProtoCategoriesModal,
    handleConsolidateCategories,
    handleOpenPruneModal,
    handleRecategorize,
  } = actions as CategoryActionsState & { handleConsolidateCategories: () => void };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const menuItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    cursor: 'pointer',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
    whiteSpace: 'nowrap',
  };

  const menuItemDisabledStyle: React.CSSProperties = {
    ...menuItemStyle,
    opacity: OPACITY_DISABLED,
    cursor: 'not-allowed',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
      <RecategorizeProgressBar progress={recategorizeProgress} onDismiss={dismissProgress} />
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          onClick={() => setMenuOpen(prev => !prev)}
          title={t('settings.emailCategories.moreActions')}
          aria-label={t('settings.emailCategories.moreActions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            background: 'transparent',
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            color: theme.colors.text.secondary,
          }}
        >
          <FiMoreVertical size={16} />
        </button>
        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              zIndex: 20,
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              minWidth: '200px',
            }}
          >
            <button
              style={menuItemStyle}
              onClick={() => {
                setShowProtoCategoriesModal(true);
                setMenuOpen(false);
              }}
            >
              {t('settings.protoCategories.viewButton')}
            </button>
            <button
              style={isConsolidating ? menuItemDisabledStyle : menuItemStyle}
              disabled={isConsolidating}
              onClick={() => {
                handleConsolidateCategories();
                setMenuOpen(false);
              }}
            >
              {isConsolidating
                ? t('settings.emailCategories.consolidating')
                : t('settings.emailCategories.consolidate')}
            </button>
            <button
              style={isPruning ? menuItemDisabledStyle : menuItemStyle}
              disabled={isPruning}
              onClick={() => {
                handleOpenPruneModal();
                setMenuOpen(false);
              }}
            >
              {isPruning
                ? t('settings.emailCategories.pruning')
                : t('settings.emailCategories.pruneUnused')}
            </button>
            <button
              style={isRecategorizing ? menuItemDisabledStyle : menuItemStyle}
              disabled={isRecategorizing}
              onClick={() => {
                handleRecategorize();
                setMenuOpen(false);
              }}
            >
              {isRecategorizing
                ? t('settings.emailCategories.recategorizing')
                : t('settings.emailCategories.recategorize')}
            </button>
          </div>
        )}
      </div>
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
  const {
    showConsolidateConfirm,
    setShowConsolidateConfirm,
    handleConsolidateConfirmed,
    showPruneConfirm,
    setShowPruneConfirm,
    handlePruneConfirmed,
    unusedCategories,
  } = actions;

  // Deep link from the inbox category ⚙️ button (?category=…).
  const [searchParams] = useSearchParams();
  useScrollToDeepLinkedCategory(searchParams.get('category'));

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
      <ConfirmModal
        isOpen={showPruneConfirm}
        title={t('settings.emailCategories.pruneUnused')}
        message={t('settings.emailCategories.pruneConfirm', {
          count: unusedCategories.length,
          names: unusedCategories.join(', '),
        })}
        confirmLabel={t('settings.emailCategories.pruneConfirmButton')}
        cancelLabel={t('common.cancel')}
        icon="🗑️"
        onConfirm={handlePruneConfirmed}
        onCancel={() => setShowPruneConfirm(false)}
      />
      {shouldShowCompressBanner && <CompressContextBanner actions={actions} />}
      {CONTEXT_SECTIONS.map(config => {
        const contextKeyStr = Array.isArray(config.contextKey) ? config.contextKey.join('-') : config.contextKey;
        const key = `context-section-${contextKeyStr}`;
        const isEmailCategory = contextKeyStr === CONTEXT_KEY_EMAIL_CATEGORY;
        const isQAndA = contextKeyStr === CONTEXT_KEY_Q_AND_A;
        const isAnchoredMatch = Boolean(config.anchorId && window.location.hash === `#${config.anchorId}`);

        if (isQAndA) {
          return (
            <QAndASection
              key={key}
              tooltipContent={t(config.tooltipKey)}
              isInitiallyExpanded={isAnchoredMatch}
              onRefresh={onRefreshContexts}
              {...commonProps}
            />
          );
        }

        const sectionElement = (
          <ContextSection
            key={key}
            title={config.title || (config.titleKey ? t(config.titleKey) : '')}
            contextKey={config.contextKey}
            addLabel={config.addLabel || (config.addLabelKey ? t(config.addLabelKey) : '')}
            tooltipContent={t(config.tooltipKey)}
            actionButton={
              isEmailCategory ? (
                <EmailCategoryControls actions={actionsWithConsolidate as CategoryActionsState} />
              ) : undefined
            }
            isInitiallyExpanded={isAnchoredMatch}
            searchable={isEmailCategory}
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
