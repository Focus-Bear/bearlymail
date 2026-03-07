import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { BulkSendConfirmModal } from 'components/inbox/bulk/BulkSendConfirmModal';
import { BulkSendResults } from 'components/inbox/bulk/BulkSendResults';
import { BulkSendSelectionControls } from 'components/inbox/bulk/BulkSendSelectionControls';
import { MAX_BULK_SEND_COUNT,OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';

interface BulkSendFollowUpsProps {
  selectedThreads: ThreadWithFollowUp[];
  onDeselectAll: () => void;
  onSelectAll: () => void;
  onBulkSend: (followUpIds: string[]) => Promise<void>;
  allThreads: ThreadWithFollowUp[];
}

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
    .filter(thread => thread.followUp && t.followUp.draftFollowUp)
    .map(thread => thread.followUp!);

  const selectedCount = selectedFollowUps.length;
  const maxAllowed = MAX_BULK_SEND_COUNT;
  const canSend = selectedCount > 0 && selectedCount <= maxAllowed && !isSending;

  const handleBulkSend = async () => {
    setIsSending(true);
    setSendResults(new Map());
    
    try {
      const followUpIds = selectedFollowUps.map(fu => fu.id);
      await onBulkSend(followUpIds);
      
      // Mark all as sent (success)
      const results = new Map<string, { success: boolean }>();
      followUpIds.forEach(id => {
        results.set(id, { success: true });
      });
      setSendResults(results);
    } catch (error: any) {
      // Mark all as failed
      const results = new Map<string, { success: boolean; error: string }>();
      selectedFollowUps.forEach(fu => {
        results.set(fu.id, { success: false, error: error.message || 'Failed to send' });
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
      <div style={{
        position: 'sticky',
        bottom: 0,
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.background.paper,
        borderTop: `1px solid ${theme.colors.border.light}`,
        boxShadow: theme.shadows.md,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
          <BulkSendSelectionControls
            selectedCount={selectedCount}
            allThreads={allThreads}
            onDeselectAll={onDeselectAll}
            onSelectAll={onSelectAll}
            maxAllowed={maxAllowed}
          />
          
          <button
            onClick={() => {
              captureEvent('bulk_followups_send_clicked', { followup_count: selectedCount });
              setShowConfirmModal(true);
            }}
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

