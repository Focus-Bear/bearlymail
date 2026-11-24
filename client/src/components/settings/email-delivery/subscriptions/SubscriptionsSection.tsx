import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { EMOJI_NEWSPAPER } from 'constants/emojis';

import { CleanupConfirmPanel } from './CleanupConfirmPanel';
import { CleanupResultPanel } from './CleanupResultPanel';
import { MailingListTable } from './MailingListTable';
import { CLEANUP_PHASES, useMailingListCleanup } from './useMailingListCleanup';

interface SubscriptionsSectionProps {
  /** Called after a cleanup, so the blocked-senders list can refresh. */
  onChanged?: () => void;
}

const PANEL_ID = 'subscriptions-panel';

const mutedText: React.CSSProperties = {
  color: theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.sm,
  margin: `0 0 ${theme.spacing.md}`,
};

const SectionToggle: React.FC<{ isExpanded: boolean; onToggle: () => void }> = ({ isExpanded, onToggle }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-expanded={isExpanded}
      aria-controls={PANEL_ID}
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.primary,
        backgroundColor: COLOR_TRANSPARENT,
        border: 'none',
        borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: theme.transitions.fast,
          fontSize: theme.typography.fontSize.base,
          color: theme.colors.text.secondary,
        }}
      >
        ▶
      </span>
      <span>
        {EMOJI_NEWSPAPER} {t('settings.subscriptions.title')}
      </span>
    </button>
  );
};

/**
 * Settings → Subscriptions: every mailing list that emailed the user recently,
 * with how much it sends. The user ticks the ones they don't want and
 * BearlyMail unsubscribes, archives their Triage mail and auto-archives
 * anything they still send.
 */
export const SubscriptionsSection: React.FC<SubscriptionsSectionProps> = ({ onChanged }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const cleanup = useMailingListCleanup(onChanged);
  const { lists, phase, selected } = cleanup;
  const isBusy = phase === CLEANUP_PHASES.RUNNING;

  const handleToggleExpanded = () => {
    const willExpand = !isExpanded;
    setIsExpanded(willExpand);
    if (willExpand && lists === null && !cleanup.isLoading) {
      void cleanup.load();
    }
  };

  return (
    <div
      id="subscriptions"
      style={{
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      <SectionToggle isExpanded={isExpanded} onToggle={handleToggleExpanded} />

      {isExpanded && (
        <div id={PANEL_ID} style={{ padding: theme.spacing.md }}>
          <p style={mutedText}>{t('settings.subscriptions.description')}</p>

          {cleanup.isLoading && lists === null && <p style={mutedText}>{t('settings.subscriptions.loading')}</p>}

          {cleanup.hasLoadError && (
            <p style={{ ...mutedText, color: theme.colors.error.dark }}>
              {t('settings.subscriptions.loadError')}{' '}
              <button type="button" onClick={() => void cleanup.load()} style={{ cursor: 'pointer' }}>
                {t('settings.subscriptions.retry')}
              </button>
            </p>
          )}

          {phase === CLEANUP_PHASES.CONFIRMING && (
            <CleanupConfirmPanel selected={selected} onConfirm={() => void cleanup.run()} onCancel={cleanup.cancel} />
          )}

          {isBusy && (
            <p aria-live="polite" style={{ ...mutedText, color: theme.colors.text.primary }}>
              {t('settings.subscriptions.progress', { done: cleanup.progress.done, total: cleanup.progress.total })}
            </p>
          )}

          {phase === CLEANUP_PHASES.DONE && (
            <CleanupResultPanel result={cleanup.result} onDismiss={cleanup.dismissResult} />
          )}

          {lists !== null && lists.length === 0 && (
            <div
              style={{
                padding: theme.spacing.xl,
                textAlign: 'center',
                color: theme.colors.text.secondary,
                border: `2px dashed ${theme.colors.border.light}`,
                borderRadius: theme.borderRadius.md,
              }}
            >
              {t('settings.subscriptions.emptyState')}
            </div>
          )}

          {lists !== null && lists.length > 0 && (
            <MailingListTable
              lists={lists}
              selectedIds={cleanup.selectedIds}
              selectedCount={selected.length}
              isBusy={isBusy}
              isConfirming={phase === CLEANUP_PHASES.CONFIRMING}
              onToggle={cleanup.toggle}
              onToggleAll={cleanup.toggleAll}
              onCleanUp={cleanup.askToConfirm}
            />
          )}
        </div>
      )}
    </div>
  );
};
