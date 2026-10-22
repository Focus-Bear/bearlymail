import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import {
  AUTO_ARCHIVE_PROPOSAL_CONFIG,
  AUTO_ARCHIVE_PROPOSAL_STATUS,
} from "../constants/auto-archive-proposal.constants";
import { MILLISECONDS } from "../constants/time-constants";
import { AutoArchiveProposal } from "../database/entities/auto-archive-proposal.entity";
import { AutoArchiveScanState } from "../database/entities/auto-archive-scan-state.entity";
import { validatePatterns } from "../summarization/pattern-matcher";
import { computeFingerprintHmac } from "../utils/hmac-email";
import {
  WorkflowActionArchive,
  WorkflowCondition,
} from "../workflows/types/workflow.types";
import { WorkflowsService } from "../workflows/workflows.service";
import { AutoArchiveMailboxLoader } from "./auto-archive-mailbox.loader";
import {
  ApproveProposalDto,
  ArchiveRuleCondition,
  ArchiveRuleKeywords,
  AutoArchiveProposalView,
  ProposalDraft,
  ProposalPreviewResult,
} from "./auto-archive-proposals.types";
import { analyseSenderGroup } from "./noise-sender-analysis.helper";
import { simulateRule, toWorkflowCondition } from "./rule-simulation.helper";
import { SenderGroupPlan } from "./sender-groups.helper";

const ARCHIVE_ACTION: WorkflowActionArchive = { type: "archive" };

/** Outcome of one mining run, for logs and the job output. */
export interface MiningRunResult {
  fullScan: boolean;
  groupsConsidered: number;
  groupsAnalysed: number;
  pendingProposals: number;
}

function windowStart(now: Date): Date {
  return new Date(
    now.getTime() - AUTO_ARCHIVE_PROPOSAL_CONFIG.WINDOW_DAYS * MILLISECONDS.DAY,
  );
}

function conditionFingerprint(condition: ArchiveRuleCondition): string {
  const canonical = (patterns: string[]) =>
    patterns.map((pattern) => pattern.trim().toLowerCase()).sort();
  return computeFingerprintHmac(
    JSON.stringify([
      condition.senderPattern.trim().toLowerCase(),
      canonical(condition.subjectPatterns),
      canonical(condition.bodyPatterns),
    ]),
  );
}

function cleanPatterns(patterns: string[]): string[] {
  return [
    ...new Set(patterns.map((pattern) => pattern.trim()).filter(Boolean)),
  ];
}

function toView(proposal: AutoArchiveProposal): AutoArchiveProposalView {
  return {
    id: proposal.id,
    status: proposal.status,
    scope: proposal.scope,
    senderDisplay: proposal.senderDisplay,
    condition: proposal.condition,
    evidence: proposal.evidence,
    workflowRuleId: proposal.workflowRuleId,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

/**
 * Mines, stores and resolves auto-archive proposals. Mining is per user over
 * the user's own mail only; nothing is shared across users and no LLM is
 * involved. A proposal only ever becomes a rule through `approve`.
 */
@Injectable()
export class AutoArchiveProposalsService {
  private readonly logger = new Logger(AutoArchiveProposalsService.name);

  constructor(
    @InjectRepository(AutoArchiveProposal)
    private readonly proposalRepository: Repository<AutoArchiveProposal>,
    @InjectRepository(AutoArchiveScanState)
    private readonly scanStateRepository: Repository<AutoArchiveScanState>,
    private readonly mailboxLoader: AutoArchiveMailboxLoader,
    private readonly workflowsService: WorkflowsService,
  ) {}

  /**
   * One incremental mining run. Re-analyses only senders with at least
   * RESCAN_MIN_NEW_EMAILS new emails since the last run, except on a full pass
   * (first run, forced, or FULL_RESCAN_AFTER_DAYS since the last full pass).
   * Must run inside the user's encryption context.
   */
  async mineForUser(
    userId: string,
    options: { forceFull?: boolean } = {},
  ): Promise<MiningRunResult> {
    const now = new Date();
    const state = await this.scanStateRepository.findOne({ where: { userId } });
    const fullScan =
      options.forceFull === true || this.isFullScanDue(state, now);
    const since = fullScan ? null : (state?.lastScannedAt ?? null);
    const groups = await this.mailboxLoader.findSenderGroups(
      userId,
      windowStart(now),
      since,
    );
    const due = groups.filter(
      (group) =>
        fullScan ||
        group.newSinceScan >=
          AUTO_ARCHIVE_PROPOSAL_CONFIG.RESCAN_MIN_NEW_EMAILS,
    );
    const archiveRules = await this.archiveWorkflowConditions(userId);
    for (const group of due) {
      await this.mineGroup(userId, group, windowStart(now), archiveRules);
    }
    if (fullScan) await this.dropPendingForQuietSenders(userId, groups);
    const pendingProposals = await this.enforcePendingCap(userId);
    await this.scanStateRepository.save({
      userId,
      lastScannedAt: now,
      lastFullScanAt: fullScan ? now : (state?.lastFullScanAt ?? null),
    });
    return {
      fullScan,
      groupsConsidered: groups.length,
      groupsAnalysed: due.length,
      pendingProposals,
    };
  }

  private isFullScanDue(state: AutoArchiveScanState | null, now: Date) {
    if (!state?.lastFullScanAt) return true;
    const ageMs = now.getTime() - state.lastFullScanAt.getTime();
    return (
      ageMs >=
      AUTO_ARCHIVE_PROPOSAL_CONFIG.FULL_RESCAN_AFTER_DAYS * MILLISECONDS.DAY
    );
  }

  /** Conditions of the user's enabled archive workflows — never re-proposed. */
  private async archiveWorkflowConditions(
    userId: string,
  ): Promise<WorkflowCondition[]> {
    const rules = await this.workflowsService.findAll(userId);
    return rules
      .filter(
        (rule) =>
          rule.enabled &&
          rule.actions.some((action) => action.type === ARCHIVE_ACTION.type),
      )
      .map((rule) => rule.condition);
  }

  private async mineGroup(
    userId: string,
    group: SenderGroupPlan,
    since: Date,
    archiveRules: WorkflowCondition[],
  ): Promise<void> {
    const emails = await this.mailboxLoader.loadGroupEmails(
      userId,
      group.memberSenderKeys,
      since,
    );
    const existing = await this.proposalRepository.find({
      where: { userId, senderKey: group.senderKey },
    });
    const responded = existing.filter(
      (proposal) => proposal.status !== AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING,
    );
    const drafts = analyseSenderGroup({ ...group, emails }, [
      ...archiveRules,
      ...responded.map((proposal) => toWorkflowCondition(proposal.condition)),
    ]);
    await this.replacePendingProposals(userId, group, existing, drafts);
  }

  /** Upserts the sender's pending proposals; drops ones the data no longer supports. */
  private async replacePendingProposals(
    userId: string,
    group: SenderGroupPlan,
    existing: AutoArchiveProposal[],
    drafts: ProposalDraft[],
  ): Promise<void> {
    const byKey = new Map(
      existing.map((proposal) => [proposal.conditionKey, proposal]),
    );
    const keptKeys = new Set<string>();
    for (const draft of drafts) {
      const conditionKey = conditionFingerprint(draft.condition);
      const current = byKey.get(conditionKey);
      if (current && current.status !== AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING) {
        continue;
      }
      keptKeys.add(conditionKey);
      await this.proposalRepository.save({
        ...(current ?? {}),
        userId,
        senderKey: group.senderKey,
        memberSenderKeys: group.memberSenderKeys,
        scope: draft.scope,
        status: AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING,
        conditionKey,
        senderDisplay: draft.senderDisplay,
        condition: draft.condition,
        evidence: draft.evidence,
      });
    }
    const stale = existing.filter(
      (proposal) =>
        proposal.status === AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING &&
        !keptKeys.has(proposal.conditionKey),
    );
    if (stale.length > 0) {
      await this.proposalRepository.delete({
        userId,
        id: In(stale.map((proposal) => proposal.id)),
      });
    }
  }

  /** A sender that is no longer heavy loses its pending proposals on a full pass. */
  private async dropPendingForQuietSenders(
    userId: string,
    groups: SenderGroupPlan[],
  ): Promise<void> {
    const activeKeys = new Set(groups.map((group) => group.senderKey));
    const pending = await this.proposalRepository.find({
      where: { userId, status: AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING },
      select: { id: true, senderKey: true },
    });
    const quiet = pending.filter(
      (proposal) => !activeKeys.has(proposal.senderKey),
    );
    if (quiet.length === 0) return;
    await this.proposalRepository.delete({
      userId,
      id: In(quiet.map((proposal) => proposal.id)),
    });
  }

  /** Keeps the largest pending proposals; returns how many remain. */
  private async enforcePendingCap(userId: string): Promise<number> {
    const pending = await this.proposalRepository.find({
      where: { userId, status: AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING },
    });
    const ranked = [...pending].sort(
      (left, right) =>
        right.evidence.window.matched - left.evidence.window.matched,
    );
    const overflow = ranked.slice(
      AUTO_ARCHIVE_PROPOSAL_CONFIG.MAX_PENDING_PER_USER,
    );
    if (overflow.length > 0) {
      await this.proposalRepository.delete({
        userId,
        id: In(overflow.map((proposal) => proposal.id)),
      });
    }
    return ranked.length - overflow.length;
  }

  /** Pending proposals, largest first. */
  async listPending(userId: string): Promise<AutoArchiveProposalView[]> {
    const pending = await this.proposalRepository.find({
      where: { userId, status: AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING },
    });
    return pending
      .map(toView)
      .sort(
        (left, right) =>
          right.evidence.window.matched - left.evidence.window.matched,
      );
  }

  private async findPending(
    userId: string,
    id: string,
  ): Promise<AutoArchiveProposal> {
    const proposal = await this.proposalRepository.findOne({
      where: { id, userId },
    });
    if (!proposal) throw new NotFoundException("Proposal not found");
    if (proposal.status !== AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING) {
      throw new ConflictException("Proposal has already been answered");
    }
    return proposal;
  }

  private withKeywords(
    condition: ArchiveRuleCondition,
    keywords: ArchiveRuleKeywords | undefined,
  ): ArchiveRuleCondition {
    if (!keywords) return condition;
    const edited = {
      senderPattern: condition.senderPattern,
      subjectPatterns: cleanPatterns(keywords.subjectPatterns),
      bodyPatterns: cleanPatterns(keywords.bodyPatterns),
    };
    const errors = validatePatterns([
      ...edited.subjectPatterns,
      ...edited.bodyPatterns,
    ]);
    if (errors.length > 0) throw new BadRequestException(errors.join("; "));
    return edited;
  }

  /**
   * Replays edited keywords over the sender's mail so the user sees what the
   * rule would have archived — including anything they opened — before
   * approving it.
   */
  async preview(
    userId: string,
    id: string,
    keywords: ArchiveRuleKeywords,
  ): Promise<ProposalPreviewResult> {
    const proposal = await this.findPending(userId, id);
    const condition = this.withKeywords(proposal.condition, keywords);
    const emails = await this.mailboxLoader.loadGroupEmails(
      userId,
      proposal.memberSenderKeys,
      windowStart(new Date()),
    );
    const { matched, stats } = simulateRule(condition, emails);
    return {
      condition,
      senderTotal: emails.length,
      window: stats,
      sampleSubjects: matched
        .slice(-AUTO_ARCHIVE_PROPOSAL_CONFIG.SAMPLE_SUBJECTS)
        .reverse()
        .map((email) => email.subject),
    };
  }

  /** Approval: the proposal becomes an ordinary archive workflow rule. */
  async approve(
    userId: string,
    id: string,
    dto: ApproveProposalDto,
  ): Promise<AutoArchiveProposalView> {
    const proposal = await this.findPending(userId, id);
    const condition = this.withKeywords(proposal.condition, dto.keywords);
    const rule = await this.workflowsService.create(userId, {
      name: dto.name,
      enabled: true,
      condition: toWorkflowCondition(condition),
      actions: [ARCHIVE_ACTION],
    });
    proposal.condition = condition;
    proposal.status = AUTO_ARCHIVE_PROPOSAL_STATUS.APPROVED;
    proposal.workflowRuleId = rule.id;
    proposal.respondedAt = new Date();
    this.logger.log(
      `[AUTO-ARCHIVE] Proposal ${id} approved as workflow ${rule.id}`,
    );
    return toView(await this.proposalRepository.save(proposal));
  }

  /** Dismissal is remembered: this rule (and ones it mostly covers) is not proposed again. */
  async dismiss(userId: string, id: string): Promise<AutoArchiveProposalView> {
    const proposal = await this.findPending(userId, id);
    proposal.status = AUTO_ARCHIVE_PROPOSAL_STATUS.DISMISSED;
    proposal.respondedAt = new Date();
    return toView(await this.proposalRepository.save(proposal));
  }
}
