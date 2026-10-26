import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { settingsKeys } from 'queries/queryKeys';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import {
  approveAutoArchiveProposal,
  ArchiveRuleKeywords,
  AutoArchiveProposal,
  dismissAutoArchiveProposal,
  fetchAutoArchiveProposals,
  requestAutoArchiveScan,
} from './autoArchiveProposals.api';

export interface AutoArchiveProposalsState {
  proposals: AutoArchiveProposal[];
  isLoading: boolean;
  hasLoadError: boolean;
  isScanQueued: boolean;
  approve: (proposal: AutoArchiveProposal, name: string, keywords?: ArchiveRuleKeywords) => Promise<void>;
  dismiss: (proposal: AutoArchiveProposal) => Promise<void>;
  scan: () => Promise<void>;
}

const isEdited = (proposal: AutoArchiveProposal, keywords?: ArchiveRuleKeywords) =>
  keywords !== undefined &&
  (keywords.subjectPatterns.join('\n') !== proposal.condition.subjectPatterns.join('\n') ||
    keywords.bodyPatterns.join('\n') !== proposal.condition.bodyPatterns.join('\n'));

/**
 * Loads the user's pending auto-archive proposals and resolves them. Approve and
 * dismiss remove the card once the server confirms; errors propagate so the
 * caller can tell the user.
 */
export function useAutoArchiveProposals(onApproved?: () => void): AutoArchiveProposalsState {
  const [proposals, setProposals] = useState<AutoArchiveProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isScanQueued, setIsScanQueued] = useState(false);
  const queryClient = useQueryClient();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setProposals(await fetchAutoArchiveProposals());
      setHasLoadError(false);
    } catch {
      setHasLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The inbox notice reads the same list through TanStack Query; refresh it so
  // it doesn't keep counting a proposal the user just resolved here.
  const removeProposal = useCallback(
    (id: string) => {
      setProposals(current => current.filter(proposal => proposal.id !== id));
      void queryClient.invalidateQueries({ queryKey: settingsKeys.autoArchiveProposals });
    },
    [queryClient]
  );

  const approve = useCallback(
    async (proposal: AutoArchiveProposal, name: string, keywords?: ArchiveRuleKeywords) => {
      await approveAutoArchiveProposal(proposal.id, name, keywords);
      captureEvent(ANALYTICS_EVENTS.AUTO_ARCHIVE_PROPOSAL_APPROVED, {
        scope: proposal.scope,
        edited: isEdited(proposal, keywords),
        matched: proposal.evidence.window.matched,
      });
      removeProposal(proposal.id);
      onApproved?.();
    },
    [onApproved, removeProposal]
  );

  const dismiss = useCallback(async (proposal: AutoArchiveProposal) => {
    await dismissAutoArchiveProposal(proposal.id);
    captureEvent(ANALYTICS_EVENTS.AUTO_ARCHIVE_PROPOSAL_DISMISSED, { scope: proposal.scope });
    removeProposal(proposal.id);
  }, [removeProposal]);

  const scan = useCallback(async () => {
    await requestAutoArchiveScan();
    captureEvent(ANALYTICS_EVENTS.AUTO_ARCHIVE_SCAN_REQUESTED);
    setIsScanQueued(true);
  }, []);

  return { proposals, isLoading, hasLoadError, isScanQueued, approve, dismiss, scan };
}
