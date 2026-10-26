import axios from 'axios';

import { API_URL } from 'config/api';

/**
 * Client types for suggested auto-archive rules. Mirrors the server's
 * `auto-archive-proposals.types.ts` (not imported across packages).
 */

export interface ArchiveRuleKeywords {
  subjectPatterns: string[];
  bodyPatterns: string[];
}

export interface ArchiveRuleCondition extends ArchiveRuleKeywords {
  senderPattern: string;
}

export interface RuleSimulationStats {
  matched: number;
  engaged: number;
  strongEngaged: number;
  glanced: number;
  opened: number;
  replied: number;
  starred: number;
}

export interface ProposalEvidence {
  windowDays: number;
  senderTotal: number;
  window: RuleSimulationStats;
  holdout: RuleSimulationStats;
  openRate: number;
  engagementUpperBound: number;
  clusterSize: number;
  sampleSubjects: string[];
  firstMatchedAt: string;
  lastMatchedAt: string;
}

/** Mirrors the server's AUTO_ARCHIVE_PROPOSAL_STATUS. */
export const AUTO_ARCHIVE_PROPOSAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DISMISSED: 'dismissed',
} as const;

export type AutoArchiveProposalStatus = (typeof AUTO_ARCHIVE_PROPOSAL_STATUS)[keyof typeof AUTO_ARCHIVE_PROPOSAL_STATUS];

export interface AutoArchiveProposal {
  id: string;
  status: AutoArchiveProposalStatus;
  scope: 'address' | 'domain';
  senderDisplay: string;
  condition: ArchiveRuleCondition;
  evidence: ProposalEvidence;
  workflowRuleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalPreview {
  condition: ArchiveRuleCondition;
  senderTotal: number;
  window: RuleSimulationStats;
  sampleSubjects: string[];
}

const PROPOSALS_URL = `${API_URL}/auto-archive-proposals`;
const proposalUrl = (id: string, action: string) => `${PROPOSALS_URL}/${id}/${action}`;

const PROPOSAL_ACTIONS = {
  PREVIEW: 'preview',
  APPROVE: 'approve',
  DISMISS: 'dismiss',
} as const;

export async function fetchAutoArchiveProposals(): Promise<AutoArchiveProposal[]> {
  const res = await axios.get<AutoArchiveProposal[]>(PROPOSALS_URL);
  return res.data;
}

export async function requestAutoArchiveScan(): Promise<{ queued: boolean }> {
  const res = await axios.post<{ queued: boolean }>(`${PROPOSALS_URL}/scan`);
  return res.data;
}

export async function previewAutoArchiveProposal(
  id: string,
  keywords: ArchiveRuleKeywords
): Promise<ProposalPreview> {
  const res = await axios.post<ProposalPreview>(proposalUrl(id, PROPOSAL_ACTIONS.PREVIEW), keywords);
  return res.data;
}

export async function approveAutoArchiveProposal(
  id: string,
  name: string,
  keywords?: ArchiveRuleKeywords
): Promise<AutoArchiveProposal> {
  const res = await axios.post<AutoArchiveProposal>(proposalUrl(id, PROPOSAL_ACTIONS.APPROVE), { name, keywords });
  return res.data;
}

export async function dismissAutoArchiveProposal(id: string): Promise<AutoArchiveProposal> {
  const res = await axios.post<AutoArchiveProposal>(proposalUrl(id, PROPOSAL_ACTIONS.DISMISS));
  return res.data;
}
