import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { getErrorMessage } from 'utils/errors';
import { captureEvent } from 'utils/posthog';

import { BulkSendConfirmModal } from 'components/inbox/bulk/BulkSendConfirmModal';
import { BulkSendResults } from 'components/inbox/bulk/BulkSendResults';
import { BulkSendSelectionControls } from 'components/inbox/bulk/BulkSendSelectionControls';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { MAX_BULK_SEND_COUNT, OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';

interface BulkSendFollowUpsProps {
  selectedThreads: ThreadWithFollowUp[];
  onDeselectAll: () => void;
  onSelectAll: () => void;
  onBulkSend: (followUpIds: string[]) => Promise<void>;
  allThreads: ThreadWithFollowUp[];
}

interface BulkSendBarProps {
  selectedCount: number;
  canSend: boolean;
  allThreads: ThreadWithFollowUp[];
  sendResults: Map<string, { success: boolean; error?: string }>;
  maxAllowed: number;
  onDeselectAll: () => void;
  onSelectAll: () => void;
  onSendClick: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

const BulkSendBar: React.FC<BulkSendBarProps> = ({
  selectedCount,
  canSend,
  allThreads,
  sendResults,
  maxAllowed,
  onDeselectAll,
  onSelectAll,
  onSendClick,
  t,
}) => (
  <div
    style={{
      position: 'sticky',
      bottom: 0,
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.background.paper,
      borderTop: `1px solid ${theme.colors.border.light}`,
      boxShadow: theme.shadows.md,
      zIndex: 100,
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
      }}
    >
      <BulkSendSelectionControls
        selectedCount={selectedCount}
        allThreads={allThreads}
        onDeselectAll={onDeselectAll}
        onSelectAll={onSelectAll}
        maxAllowed={maxAllowed}
      />
      <button
        onClick={onSendClick}
        disabled={!canSend}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: canSend ? theme.colors.primary.main : theme.colors.background.disabled,
          color: theme.colors.background.paper,
          border: 'none',
          borderRadius: theme.borderRadius.md,
          cursor: canSend ? 'pointer' : 'not-allowed',
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.medium,
          opacity: canSend ? OPACITY_FULL : OPACITY_DISABLED,
        }}
      >
        {t('inbox.sendFollowUps', { count: selectedCount })}
      </button>
    </div>
    <BulkSendResults sendResults={sendResults} />
  </div>
);

export const BulkSendFollowUps: React.FC<BulkSendFollowUpsProps> = ({
  selectedThreads,
  onDeselectAll,
  onSelectAll,
  onBulkSend,
  allThreads,
}) => {
  const { t } = useTranslation();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResults, setSendResults] = useState<Map<string, { success: boolean; error?: string }>>(new Map());

  const selectedFollowUps = selectedThreads
    .filter(thread => thread.followUp && thread.followUp.draftFollowUp)
    .map(thread => thread.followUp!);

  const selectedCount = selectedFollowUps.length;
  const maxAllowed = MAX_BULK_SEND_COUNT;
  const canSend = selectedCount > 0 && selectedCount <= maxAllowed && !isSending;

  const handleBulkSend = async () => {
    setIsSending(true);
    setSendResults(new Map());
    try {
      const followUpIds = selectedFollowUps.map(followUp => followUp.id);
      await onBulkSend(followUpIds);
      const results = new Map<string, { success: boolean }>();
      followUpIds.forEach(id => {
        results.set(id, { success: true });
      });
      setSendResults(results);
    } catch (error: unknown) {
      const results = new Map<string, { success: boolean; error: string }>();
      selectedFollowUps.forEach(followUp => {
        results.set(followUp.id, { success: false, error: getErrorMessage(error, 'Failed to send') });
      });
      setSendResults(results);
    } finally {
      setIsSending(false);
    }
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      <BulkSendBar
        selectedCount={selectedCount}
        canSend={canSend}
        allThreads={allThreads}
        sendResults={sendResults}
        maxAllowed={maxAllowed}
        onDeselectAll={onDeselectAll}
        onSelectAll={onSelectAll}
        onSendClick={() => {
          captureEvent(ANALYTICS_EVENTS.BULK_FOLLOWUPS_SEND_CLICKED, { followup_count: selectedCount });
          setShowConfirmModal(true);
        }}
        t={t}
      />
      {showConfirmModal && (
        <BulkSendConfirmModal
          selectedCount={selectedCount}
          selectedFollowUps={selectedFollowUps}
          selectedThreads={selectedThreads}
          isSending={isSending}
          onConfirm={() => {
            setShowConfirmModal(false);
            handleBulkSend();
          }}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
    </>
  );
};
