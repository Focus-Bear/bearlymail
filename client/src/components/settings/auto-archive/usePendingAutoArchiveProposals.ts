import { useQuery } from '@tanstack/react-query';
import { STALE_TIME_5_MIN } from 'queries/constants';
import { settingsKeys } from 'queries/queryKeys';

import { AUTO_ARCHIVE_PROPOSAL_STATUS, AutoArchiveProposal, fetchAutoArchiveProposals } from './autoArchiveProposals.api';

const selectPending = (proposals: AutoArchiveProposal[]) =>
  proposals.filter(proposal => proposal.status === AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING);

/**
 * Read-only list of pending auto-archive proposals for surfaces outside Settings
 * (the inbox notice). Proposals are mined once a day, so a long stale time keeps
 * this to about one request per inbox session; Settings invalidates it when the
 * user approves or dismisses one.
 */
export function usePendingAutoArchiveProposals(isEnabled: boolean) {
  return useQuery({
    queryKey: settingsKeys.autoArchiveProposals,
    queryFn: fetchAutoArchiveProposals,
    select: selectPending,
    staleTime: STALE_TIME_5_MIN,
    enabled: isEnabled,
  });
}
