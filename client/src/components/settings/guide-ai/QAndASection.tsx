import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { InfoTooltip } from 'components/InfoTooltip';
import { API_URL } from 'config/api';
import { COLOR_BG_WARNING_AMBER, COLOR_NAMED_WHITE, COLOR_TRANSPARENT, COLOR_WARNING_TEXT } from 'constants/colors';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import {
  CONTEXT_KEY_Q_AND_A,
  CONTEXT_SOURCE_UNAPPROVED,
  KEY_ENTER,
  KEY_ESCAPE,
  QA_TAB_APPROVED,
  QA_TAB_PENDING,
  STRING_NONE,
} from 'constants/strings';
import { useNotifications } from 'contexts/NotificationContext';

interface UserContext {
  contextId: string;
  contextKey: string;
  contextValue: string;
  source: string;
  priority?: number;
  explanation?: string;
  sourceThreadIds?: string[];
}

interface QAndASectionProps {
  contexts: UserContext[];
  tooltipContent?: string;
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
  onRefresh?: () => void;
  isInitiallyExpanded?: boolean;
}

function parseQAndA(contextValue: string): { question: string; answer: string } {
  // Use a regex to handle any whitespace variation around 'Q:', '|', and 'A:'
  // (e.g. "Q:x|A:y", "Q: x | A: y", "Q:  x  |  A:  y")
  const match = contextValue.match(/Q:\s*(.+?)\s*\|\s*A:\s*(.+)/);
  if (match) {
    return { question: match[1].trim(), answer: match[2].trim() };
  }
  // Fallback: show raw value as question so content is never silently blank
  return { question: contextValue, answer: '' };
}

type TabType = 'approved' | 'pending';

interface PendingQAItemProps {
  context: UserContext;
  editingContextId: string | null;
  editContextValue: string;
  onApprove: (contextId: string) => Promise<void>;
  onReject: (contextId: string) => Promise<void>;
  onEdit: (contextId: string, value: string) => void;
  onUpdateContext: () => Promise<void>;
  onEditingContextIdChange: (id: string | null) => void;
  onEditContextValueChange: (value: string) => void;
}

const PendingQAItem: React.FC<PendingQAItemProps> = ({
  context,
  editingContextId,
  editContextValue,
  onApprove,
  onReject,
  onEdit,
  onUpdateContext,
  onEditingContextIdChange,
  onEditContextValueChange,
}) => {
  const { t } = useTranslation();
  const { question, answer } = parseQAndA(context.contextValue);

  if (editingContextId === context.contextId) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: theme.spacing.sm,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <div style={{ display: 'flex', flex: 1, gap: theme.spacing.sm }}>
          <input
            type="text"
            value={editContextValue}
            onChange={event => onEditContextValueChange(event.target.value)}
            style={{
              flex: 1,
              padding: theme.spacing.xs,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${theme.colors.border.medium}`,
            }}
          />
          <button
            onClick={onUpdateContext}
            style={{
              cursor: 'pointer',
              color: theme.colors.primary.main,
              border: STRING_NONE,
              background: STRING_NONE,
            }}
          >
            {t('common.save')}
          </button>
          <button
            onClick={() => onEditingContextIdChange(null)}
            style={{
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              border: STRING_NONE,
              background: STRING_NONE,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        gap: theme.spacing.sm,
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        <div style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
          {t('settings.context.question')}: {question}
        </div>
        <div style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
          {t('settings.context.answer')}: {answer}
        </div>
        {context.explanation && (
          <span
            style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, fontStyle: 'italic' }}
          >
            {context.explanation}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.xs, flexShrink: 0 }}>
        <button
          onClick={() => onApprove(context.contextId)}
          title={t('settings.context.approve')}
          style={{
            cursor: 'pointer',
            color: theme.colors.accent.success,
            border: STRING_NONE,
            background: STRING_NONE,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          <span aria-hidden="true">{'✅ '}</span>
          {t('settings.context.approve')}
        </button>
        <button
          onClick={() => onEdit(context.contextId, context.contextValue)}
          title={t('common.edit')}
          style={{
            cursor: 'pointer',
            color: theme.colors.primary.main,
            border: STRING_NONE,
            background: STRING_NONE,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          <span aria-hidden="true">{'✏️ '}</span>
          {t('common.edit')}
        </button>
        <button
          onClick={() => onReject(context.contextId)}
          title={t('settings.context.reject')}
          style={{
            cursor: 'pointer',
            color: theme.colors.accent.error,
            border: STRING_NONE,
            background: STRING_NONE,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          <span aria-hidden="true">{'❌ '}</span>
          {t('settings.context.reject')}
        </button>
      </div>
    </div>
  );
};

interface ApprovedQAItemProps {
  context: UserContext;
  editingContextId: string | null;
  editContextValue: string;
  onUpdateContext: () => Promise<void>;
  onEditingContextIdChange: (id: string | null) => void;
  onEditContextValueChange: (value: string) => void;
  onDeleteContext: (contextId: string) => void;
}

const ApprovedQAItem: React.FC<ApprovedQAItemProps> = ({
  context,
  editingContextId,
  editContextValue,
  onUpdateContext,
  onEditingContextIdChange,
  onEditContextValueChange,
  onDeleteContext,
}) => {
  const { t } = useTranslation();
  const { question, answer } = parseQAndA(context.contextValue);

  if (editingContextId === context.contextId) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: theme.spacing.sm,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <div style={{ display: 'flex', flex: 1, gap: theme.spacing.sm }}>
          <input
            type="text"
            value={editContextValue}
            onChange={event => onEditContextValueChange(event.target.value)}
            style={{
              flex: 1,
              padding: theme.spacing.xs,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${theme.colors.border.medium}`,
            }}
          />
          <button
            onClick={onUpdateContext}
            style={{
              cursor: 'pointer',
              color: theme.colors.primary.main,
              border: STRING_NONE,
              background: STRING_NONE,
            }}
          >
            {t('common.save')}
          </button>
          <button
            onClick={() => onEditingContextIdChange(null)}
            style={{
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              border: STRING_NONE,
              background: STRING_NONE,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        gap: theme.spacing.sm,
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        <div style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
          {t('settings.context.question')}: {question}
        </div>
        <div style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
          {t('settings.context.answer')}: {answer}
        </div>
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm, flexShrink: 0 }}>
        <button
          onClick={() => {
            onEditingContextIdChange(context.contextId);
            onEditContextValueChange(context.contextValue);
          }}
          style={{
            cursor: 'pointer',
            color: theme.colors.primary.main,
            border: STRING_NONE,
            background: STRING_NONE,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.edit')}
        </button>
        <button
          onClick={() => onDeleteContext(context.contextId)}
          style={{
            cursor: 'pointer',
            color: theme.colors.accent.error,
            border: STRING_NONE,
            background: STRING_NONE,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
};

interface AddQAInputProps {
  newContextValue: string;
  onNewContextValueChange: (value: string) => void;
  onAddContext: () => Promise<void>;
  onCancel: () => void;
}

const AddQAInput: React.FC<AddQAInputProps> = ({
  newContextValue,
  onNewContextValueChange,
  onAddContext,
  onCancel,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
      <input
        type="text"
        value={newContextValue}
        onChange={event => onNewContextValueChange(event.target.value)}
        placeholder={t('settings.addContext.placeholder')}
        autoFocus
        style={{
          flex: 1,
          padding: theme.spacing.sm,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.primary.main}`,
        }}
        onKeyDown={event => {
          if (event.key === KEY_ENTER) {
            onAddContext();
          }
          if (event.key === KEY_ESCAPE) {
            onCancel();
          }
        }}
      />
      <button
        onClick={onAddContext}
        disabled={!newContextValue.trim()}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: newContextValue.trim() ? 'pointer' : 'not-allowed',
          opacity: newContextValue.trim() ? OPACITY_FULL : OPACITY_DISABLED,
        }}
      >
        {t('common.add')}
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: STRING_NONE,
          cursor: 'pointer',
        }}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
};

// ─── Shared badge style (module-level constant, no closure needed) ──────────

const badgeStyle: React.CSSProperties = {
  backgroundColor: theme.colors.greyscale[300],
  color: theme.colors.text.secondary,
  padding: '1px 6px',
  borderRadius: theme.borderRadius.full,
  fontSize: theme.typography.fontSize.xs,
  marginLeft: theme.spacing.xs,
};

function makeTabStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    border: STRING_NONE,
    borderBottom: isActive ? `2px solid ${theme.colors.primary.main}` : '2px solid transparent',
    background: COLOR_TRANSPARENT,
    cursor: 'pointer',
    color: isActive ? theme.colors.primary.main : theme.colors.text.secondary,
    fontWeight: isActive ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.normal,
    fontSize: theme.typography.fontSize.sm,
  };
}

// ─── PendingTab ──────────────────────────────────────────────────────────────

interface PendingTabProps {
  pendingContexts: UserContext[];
  isApprovingAll: boolean;
  editingContextId: string | null;
  editContextValue: string;
  onApprove: (contextId: string) => Promise<void>;
  onReject: (contextId: string) => Promise<void>;
  onEdit: (contextId: string, value: string) => void;
  onApproveAll: () => Promise<void>;
  onUpdateContext: () => Promise<void>;
  onEditingContextIdChange: (id: string | null) => void;
  onEditContextValueChange: (value: string) => void;
}

const PendingTab: React.FC<PendingTabProps> = ({
  pendingContexts,
  isApprovingAll,
  editingContextId,
  editContextValue,
  onApprove,
  onReject,
  onEdit,
  onApproveAll,
  onUpdateContext,
  onEditingContextIdChange,
  onEditContextValueChange,
}) => {
  const { t } = useTranslation();
  return (
    <>
      {pendingContexts.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: theme.spacing.xs }}>
          <button
            onClick={onApproveAll}
            disabled={isApprovingAll}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              backgroundColor: theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.md,
              cursor: isApprovingAll ? 'not-allowed' : 'pointer',
              opacity: isApprovingAll ? OPACITY_DISABLED : OPACITY_FULL,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {isApprovingAll ? t('settings.context.approvingAll') : t('settings.context.approveAll')}
          </button>
        </div>
      )}
      {pendingContexts.length === 0 ? (
        <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm, fontStyle: 'italic' }}>
          {t('settings.context.noPendingQA')}
        </div>
      ) : (
        pendingContexts.map(context => (
          <PendingQAItem
            key={context.contextId}
            context={context}
            editingContextId={editingContextId}
            editContextValue={editContextValue}
            onApprove={onApprove}
            onReject={onReject}
            onEdit={onEdit}
            onUpdateContext={onUpdateContext}
            onEditingContextIdChange={onEditingContextIdChange}
            onEditContextValueChange={onEditContextValueChange}
          />
        ))
      )}
    </>
  );
};

// ─── ApprovedTab ─────────────────────────────────────────────────────────────

interface ApprovedTabProps {
  approvedContexts: UserContext[];
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

const ApprovedTab: React.FC<ApprovedTabProps> = ({
  approvedContexts,
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
  return (
    <>
      {approvedContexts.length === 0 ? (
        <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm, fontStyle: 'italic' }}>
          {t('settings.context.noApprovedQA')}
        </div>
      ) : (
        approvedContexts.map(context => (
          <ApprovedQAItem
            key={context.contextId}
            context={context}
            editingContextId={editingContextId}
            editContextValue={editContextValue}
            onUpdateContext={onUpdateContext}
            onEditingContextIdChange={onEditingContextIdChange}
            onEditContextValueChange={onEditContextValueChange}
            onDeleteContext={onDeleteContext}
          />
        ))
      )}
      {addingContextType === CONTEXT_KEY_Q_AND_A ? (
        <AddQAInput
          newContextValue={newContextValue}
          onNewContextValueChange={onNewContextValueChange}
          onAddContext={onAddContext}
          onCancel={() => {
            onAddingContextTypeChange(null);
            onNewContextValueChange('');
          }}
        />
      ) : (
        <button
          onClick={() => {
            onAddingContextTypeChange(CONTEXT_KEY_Q_AND_A);
            onNewContextValueChange('');
          }}
          style={{
            alignSelf: 'flex-start',
            marginTop: theme.spacing.xs,
            background: COLOR_TRANSPARENT,
            border: `1px dashed ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <span>+</span> {t('settings.addContext.qa')}
        </button>
      )}
    </>
  );
};

// ─── QAndASectionHeader ───────────────────────────────────────────────────────

interface QAndASectionHeaderProps {
  isExpanded: boolean;
  totalCount: number;
  pendingCount: number;
  tooltipContent?: string;
  onToggle: () => void;
}

const QAndASectionHeader: React.FC<QAndASectionHeaderProps> = ({
  isExpanded,
  totalCount,
  pendingCount,
  tooltipContent,
  onToggle,
}) => {
  const { t } = useTranslation();
  return (
    <div
      onClick={onToggle}
      style={{
        fontSize: theme.typography.fontSize.lg,
        color: theme.colors.text.primary,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        cursor: 'pointer',
        backgroundColor: theme.colors.background.paper,
        borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
        borderRadius: isExpanded ? `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0` : theme.borderRadius.md,
        transition: theme.transitions.fast,
      }}
    >
      <span
        style={{
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: theme.transitions.fast,
          fontSize: theme.typography.fontSize.base,
          color: theme.colors.text.secondary,
        }}
      >
        ▶
      </span>
      <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>{t('settings.contextSections.qanda')}</span>
      <span style={badgeStyle}>{totalCount}</span>
      {pendingCount > 0 && (
        <span style={{ ...badgeStyle, backgroundColor: COLOR_BG_WARNING_AMBER, color: COLOR_WARNING_TEXT }}>
          {t('settings.context.pendingCount', { count: pendingCount })}
        </span>
      )}
      {tooltipContent && <InfoTooltip content={tooltipContent} />}
    </div>
  );
};

// ─── QAndASectionBody ─────────────────────────────────────────────────────────

interface QAndASectionBodyProps extends ApprovedTabProps {
  activeTab: TabType;
  pendingContexts: UserContext[];
  isApprovingAll: boolean;
  onTabChange: (tab: TabType) => void;
  onApprove: (contextId: string) => Promise<void>;
  onReject: (contextId: string) => Promise<void>;
  onEdit: (contextId: string, value: string) => void;
  onApproveAll: () => Promise<void>;
}

const QAndASectionBody: React.FC<QAndASectionBodyProps> = ({
  activeTab,
  pendingContexts,
  approvedContexts,
  isApprovingAll,
  onTabChange,
  onApprove,
  onReject,
  onEdit,
  onApproveAll,
  ...approvedTabProps
}) => {
  const { t } = useTranslation();
  const { editingContextId, editContextValue, onUpdateContext, onEditingContextIdChange, onEditContextValueChange } =
    approvedTabProps;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${theme.colors.border.light}`,
          padding: `0 ${theme.spacing.md}`,
        }}
      >
        <button style={makeTabStyle(activeTab === QA_TAB_PENDING)} onClick={() => onTabChange(QA_TAB_PENDING)}>
          {t('settings.context.pendingReview')}
          {pendingContexts.length > 0 && <span style={badgeStyle}>{pendingContexts.length}</span>}
        </button>
        <button style={makeTabStyle(activeTab === QA_TAB_APPROVED)} onClick={() => onTabChange(QA_TAB_APPROVED)}>
          {t('settings.context.approved')}
          <span style={badgeStyle}>{approvedContexts.length}</span>
        </button>
      </div>
      <div style={{ padding: theme.spacing.md, display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {activeTab === QA_TAB_PENDING && (
          <PendingTab
            pendingContexts={pendingContexts}
            isApprovingAll={isApprovingAll}
            editingContextId={editingContextId}
            editContextValue={editContextValue}
            onApprove={onApprove}
            onReject={onReject}
            onEdit={onEdit}
            onApproveAll={onApproveAll}
            onUpdateContext={onUpdateContext}
            onEditingContextIdChange={onEditingContextIdChange}
            onEditContextValueChange={onEditContextValueChange}
          />
        )}
        {activeTab === QA_TAB_APPROVED && <ApprovedTab approvedContexts={approvedContexts} {...approvedTabProps} />}
      </div>
    </div>
  );
};

// ─── useQAndAHandlers ─────────────────────────────────────────────────────────

function useQAndAHandlers(
  onRefresh: (() => void) | undefined,
  onEditingContextIdChange: (id: string | null) => void,
  onEditContextValueChange: (value: string) => void,
  setActiveTab: (tab: TabType) => void
) {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  const handleApprove = async (contextId: string) => {
    try {
      await axios.patch(`${API_URL}/context/${contextId}/approve`);
      showSuccess(t('settings.context.approveSuccess'));
      onRefresh?.();
    } catch {
      showError(t('settings.context.approveError'));
    }
  };

  const handleReject = async (contextId: string) => {
    try {
      await axios.patch(`${API_URL}/context/${contextId}/reject`);
      showSuccess(t('settings.context.rejectSuccess'));
      onRefresh?.();
    } catch {
      showError(t('settings.context.rejectError'));
    }
  };

  const handleEditAndApprove = (contextId: string, value: string) => {
    onEditingContextIdChange(contextId);
    onEditContextValueChange(value);
    setActiveTab('pending');
  };

  const handleApproveAll = async () => {
    setIsApprovingAll(true);
    try {
      const response = await axios.patch(`${API_URL}/context/approve-all-qa`);
      const { approved } = response.data as { approved: number };
      showSuccess(t('settings.context.approveAllSuccess', { count: approved }));
      onRefresh?.();
    } catch {
      showError(t('settings.context.approveAllError'));
    } finally {
      setIsApprovingAll(false);
    }
  };

  return { isApprovingAll, handleApprove, handleReject, handleEditAndApprove, handleApproveAll };
}

// ─── QAndASection ─────────────────────────────────────────────────────────────

export const QAndASection: React.FC<QAndASectionProps> = ({
  contexts,
  tooltipContent,
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
  onRefresh,
  isInitiallyExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(Boolean(isInitiallyExpanded));
  const [activeTab, setActiveTab] = useState<TabType>('pending');

  const qaContexts = contexts.filter(ctx => ctx.contextKey === CONTEXT_KEY_Q_AND_A);
  const pendingContexts = qaContexts.filter(ctx => ctx.source === CONTEXT_SOURCE_UNAPPROVED);
  const approvedContexts = qaContexts.filter(ctx => ctx.source !== CONTEXT_SOURCE_UNAPPROVED);

  const { isApprovingAll, handleApprove, handleReject, handleEditAndApprove, handleApproveAll } = useQAndAHandlers(
    onRefresh,
    onEditingContextIdChange,
    onEditContextValueChange,
    setActiveTab
  );

  return (
    <div
      style={{
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      <QAndASectionHeader
        isExpanded={isExpanded}
        totalCount={qaContexts.length}
        pendingCount={pendingContexts.length}
        tooltipContent={tooltipContent}
        onToggle={() => setIsExpanded(!isExpanded)}
      />
      {isExpanded && (
        <QAndASectionBody
          activeTab={activeTab}
          pendingContexts={pendingContexts}
          approvedContexts={approvedContexts}
          isApprovingAll={isApprovingAll}
          onTabChange={setActiveTab}
          onApprove={handleApprove}
          onReject={handleReject}
          onEdit={handleEditAndApprove}
          onApproveAll={handleApproveAll}
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
      )}
    </div>
  );
};
