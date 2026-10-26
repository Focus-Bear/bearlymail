import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

import type { AutoArchiveSenderScope } from "../constants/auto-archive-proposal.constants";
import type { EngagementLevel, EngagementSignals } from "./engagement.helper";

/** One received email as the miner sees it (decrypted, in memory only). */
export interface AnalysedEmail {
  id: string;
  from: string;
  subject: string;
  /** Body truncated to what the workflow engine evaluates. */
  body: string;
  receivedAt: Date;
  signals: EngagementSignals;
  level: EngagementLevel;
  /**
   * Notification sub-stream (e.g. `github:ci:run_failed`), or null for mail
   * that isn't a recognised platform notification. Clustering never mixes
   * sub-streams, so one sender's CI failures and review requests are judged
   * separately.
   */
  notificationSubtype: string | null;
}

/** The keyword side of a proposed rule. Sender is matched separately. */
export interface ArchiveRuleKeywords {
  /** Subject must contain ANY of these (empty = any subject). */
  subjectPatterns: string[];
  /** Body must contain ANY of these (empty = any body). */
  bodyPatterns: string[];
}

/** Proposed rule: sender + keyword conditions → archive. */
export interface ArchiveRuleCondition extends ArchiveRuleKeywords {
  /** Exact address or `*@domain` glob, in the workflow engine's pattern syntax. */
  senderPattern: string;
}

/** A sender (address or automated domain group) heavy enough to analyse. */
export interface SenderGroup {
  /** Address HMAC, or a domain-group key (see DOMAIN_SENDER_KEY_PREFIX). */
  senderKey: string;
  scope: AutoArchiveSenderScope;
  senderPattern: string;
  /** Human-readable sender for the UI, e.g. "GitHub <notifications@github.com>". */
  senderDisplay: string;
  /** In receivedAt order, oldest first. */
  emails: AnalysedEmail[];
}

/** Results of replaying a rule over past mail. */
export interface RuleSimulationStats {
  matched: number;
  /** Opened-and-read or acted on (see ENGAGEMENT_LEVEL.ENGAGED). */
  engaged: number;
  /** Of `engaged`: replied, starred or raised priority. */
  strongEngaged: number;
  glanced: number;
  opened: number;
  replied: number;
  starred: number;
}

/** Evidence stored with a proposal and shown to the user. */
export interface ProposalEvidence {
  windowDays: number;
  /** Emails from this sender in the window. */
  senderTotal: number;
  /** Emails the rule would have archived over the whole window. */
  window: RuleSimulationStats;
  /** Same, restricted to the held-out (most recent) slice the rule was not mined from. */
  holdout: RuleSimulationStats;
  /** Share of matched emails opened at all (0–1). */
  openRate: number;
  /** Wilson upper bound of the engagement rate of matched emails. */
  engagementUpperBound: number;
  /** Training-cluster size the rule was mined from. */
  clusterSize: number;
  /** Most recent matched subjects (encrypted at rest with the evidence). */
  sampleSubjects: string[];
  firstMatchedAt: string;
  lastMatchedAt: string;
}

/** A rule the miner wants to propose, before persistence. */
export interface ProposalDraft {
  senderKey: string;
  scope: AutoArchiveSenderScope;
  senderDisplay: string;
  condition: ArchiveRuleCondition;
  evidence: ProposalEvidence;
}

/** API shape of a stored proposal. */
export interface AutoArchiveProposalView {
  id: string;
  status: string;
  scope: AutoArchiveSenderScope;
  senderDisplay: string;
  condition: ArchiveRuleCondition;
  evidence: ProposalEvidence;
  workflowRuleId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Result of a re-simulation with user-edited keywords. */
export interface ProposalPreviewResult {
  condition: ArchiveRuleCondition;
  senderTotal: number;
  window: RuleSimulationStats;
  sampleSubjects: string[];
}

const MAX_KEYWORDS_PER_FIELD = 10;
const MAX_KEYWORD_CHARS = 200;
const MAX_RULE_NAME_CHARS = 200;

/** Edited keywords sent with a preview or an approval. */
export class ProposalKeywordsDto implements ArchiveRuleKeywords {
  @IsArray()
  @ArrayMaxSize(MAX_KEYWORDS_PER_FIELD)
  @IsString({ each: true })
  @MaxLength(MAX_KEYWORD_CHARS, { each: true })
  subjectPatterns!: string[];

  @IsArray()
  @ArrayMaxSize(MAX_KEYWORDS_PER_FIELD)
  @IsString({ each: true })
  @MaxLength(MAX_KEYWORD_CHARS, { each: true })
  bodyPatterns!: string[];
}

export class ApproveProposalDto {
  /** Workflow name, localised by the client. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_RULE_NAME_CHARS)
  name!: string;

  /** Edited keywords; omitted = approve the proposal as mined. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ProposalKeywordsDto)
  keywords?: ProposalKeywordsDto;
}
