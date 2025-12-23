import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';
import { ThreadWithFollowUp } from '../../hooks/useFollowUps';
import { captureEvent } from '../../utils/posthog';

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
    .filter(t => t.followUp && t.followUp.draftFollowUp)
    .map(t => t.followUp!);

  const selectedCount = selectedFollowUps.length;
  const maxAllowed = 20;
  const isOverLimit = selectedCount > maxAllowed;
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
          <div>
            <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
              <button
                onClick={selectedCount === allThreads.filter(t => t.followUp?.draftFollowUp).length ? onDeselectAll : onSelectAll}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.primary.main,
                  border: `1px solid ${theme.colors.primary.main}`,
                  borderRadius: theme.borderRadius.sm,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                {selectedCount === allThreads.filter(t => t.followUp?.draftFollowUp).length ? t('common.deselectAll') : t('common.selectAll')}
              </button>
              
              <span style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
              }}>
                {selectedCount} {selectedCount === 1 ? t('inbox.followUp') : t('inbox.followUps')} {t('common.selected')}
              </span>
            </div>
            
            {isOverLimit && (
              <div style={{
                marginTop: theme.spacing.xs,
                padding: theme.spacing.sm,
                backgroundColor: theme.colors.warning.light,
                borderRadius: theme.borderRadius.sm,
                color: theme.colors.warning.main,
                fontSize: theme.typography.fontSize.sm,
              }}>
                {t('inbox.maxFollowUpsWarning', { max: maxAllowed })}
              </div>
            )}
          </div>
          
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
              opacity: canSend ? 1 : 0.6,
            }}
          >
            {t('inbox.sendFollowUps', { count: selectedCount })}
          </button>
        </div>

        {sendResults.size > 0 && (
          <div style={{
            marginTop: theme.spacing.md,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.borderRadius.md,
          }}>
            <div style={{
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.semibold,
              marginBottom: theme.spacing.xs,
            }}>
              {t('inbox.sendResults')}
            </div>
            {Array.from(sendResults.entries()).map(([id, result]) => (
              <div key={id} style={{
                padding: theme.spacing.xs,
                color: result.success ? theme.colors.success.main : theme.colors.error.main,
                fontSize: theme.typography.fontSize.xs,
              }}>
                {result.success ? '✓ ' : '✗ '}
                {result.error || t('inbox.sent')}
              </div>
            ))}
          </div>
        )}
      </div>

      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
        onClick={() => setShowConfirmModal(false)}
        >
          <div style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.xl,
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            width: '90%',
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              margin: 0,
              marginBottom: theme.spacing.lg,
              fontSize: theme.typography.fontSize.xl,
              fontWeight: theme.typography.fontWeight.bold,
            }}>
              {t('inbox.confirmBulkSend', { count: selectedCount })}
            </h3>
            
            <div style={{
              marginBottom: theme.spacing.lg,
              maxHeight: '400px',
              overflow: 'auto',
            }}>
              {selectedFollowUps.slice(0, 10).map((fu, idx) => {
                const thread = selectedThreads.find(t => t.followUp?.id === fu.id);
                return (
                  <div key={fu.id} style={{
                    padding: theme.spacing.md,
                    marginBottom: theme.spacing.sm,
                    backgroundColor: theme.colors.background.default,
                    borderRadius: theme.borderRadius.md,
                  }}>
                    <div style={{
                      fontWeight: theme.typography.fontWeight.semibold,
                      marginBottom: theme.spacing.xs,
                    }}>
                      {thread?.subject || t('inbox.followUp')}
                    </div>
                    <div style={{
                      fontSize: theme.typography.fontSize.sm,
                      color: theme.colors.text.secondary,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {fu.draftFollowUp?.substring(0, 200)}
                      {fu.draftFollowUp && fu.draftFollowUp.length > 200 ? '...' : ''}
                    </div>
                  </div>
                );
              })}
              {selectedCount > 10 && (
                <div style={{
                  padding: theme.spacing.md,
                  textAlign: 'center',
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.sm,
                }}>
                  {t('inbox.andMore', { count: selectedCount - 10 })}
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  captureEvent('bulk_followups_send_cancelled');
                  setShowConfirmModal(false);
                }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: `1px solid ${theme.colors.border.light}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  captureEvent('bulk_followups_send_confirmed', { followup_count: selectedCount });
                  setShowConfirmModal(false);
                  handleBulkSend();
                }}
                disabled={isSending}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.primary.main,
                  color: theme.colors.background.paper,
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: isSending ? 'wait' : 'pointer',
                }}
              >
                {isSending ? t('inbox.sending') : t('common.send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

