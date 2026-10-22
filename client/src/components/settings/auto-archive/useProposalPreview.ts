import { useEffect, useRef, useState } from 'react';

import { ArchiveRuleKeywords, previewAutoArchiveProposal, ProposalPreview } from './autoArchiveProposals.api';

export interface ProposalPreviewState {
  preview: ProposalPreview | null;
  isLoading: boolean;
  hasError: boolean;
}

/**
 * Re-simulates a proposal with edited keywords whenever they change, so the
 * user sees what the edited rule would have archived before approving it.
 * Only the latest request's answer is kept.
 */
export function useProposalPreview(proposalId: string, keywords: ArchiveRuleKeywords | null): ProposalPreviewState {
  const [state, setState] = useState<ProposalPreviewState>({ preview: null, isLoading: false, hasError: false });
  const latestRequest = useRef(0);
  const subjectKey = keywords?.subjectPatterns.join('\n');
  const bodyKey = keywords?.bodyPatterns.join('\n');

  useEffect(() => {
    if (!keywords) {
      return;
    }
    latestRequest.current += 1;
    const requestId = latestRequest.current;
    setState(current => ({ ...current, isLoading: true, hasError: false }));
    previewAutoArchiveProposal(proposalId, keywords)
      .then(preview => {
        if (requestId === latestRequest.current) {
          setState({ preview, isLoading: false, hasError: false });
        }
      })
      .catch(() => {
        if (requestId === latestRequest.current) {
          setState({ preview: null, isLoading: false, hasError: true });
        }
      });
    // Keyed on the joined lists so a re-render with equal arrays does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, subjectKey, bodyKey]);

  return state;
}
