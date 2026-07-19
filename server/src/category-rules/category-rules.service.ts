import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CATEGORY_RULE_MATCH_MODES } from "../constants/domain-types";
import {
  CategoryRule,
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { buildRuleEmailMetadata } from "../emails/rule-email-metadata.helper";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import type {
  CategoryRuleDto,
  CategoryRuleEvaluationDebug,
  CategoryRuleEvaluationSet,
  CategoryRuleMatch,
  CategoryRuleSuggestion,
  CategoryRuleTraceSnapshot,
  CompositeRuleDraft,
  DeterministicRulesDebug,
  EmailMetadata,
} from "./category-rules.types";
import {
  compositeAutoSpecsMatch,
  EmailHashes,
  specToV2,
} from "./category-rules-auto-composite.helper";
import {
  buildDraftCompositeSpec,
  DraftCompositeSpecDeps,
} from "./category-rules-draft.helper";
import {
  loadRuleEvaluationSet,
  loadUserCategoryIndex,
} from "./category-rules-evaluation-set.helper";
import {
  buildEmailHashes,
  findFirstCompositeRuleMatch,
  findLegacyRuleMatch,
} from "./category-rules-match.helper";
import {
  dropContradictoryExclusions,
  specHasExclusion,
} from "./category-rules-match-gate.helper";
import { evaluateRulePersistGate } from "./category-rules-persist-gate.helper";
import { retroApplyRuleIfEligible } from "./category-rules-retro-apply.helper";
import { SUBJECT_PREFIX_REGEX } from "./category-rules-sender.constants";
import { normalizeCompositeSpec } from "./category-rules-spec-normalizer.helper";
import {
  buildSuggestions,
  countDistinctThreadsForSenderHmac,
} from "./category-rules-suggest.helper";
import {
  buildRuleEvaluationDebug,
  collectMatchingRuleIds,
  resolveRuleCategoryId,
} from "./category-rules-trace.helper";
import {
  findCategoryContextIdByName,
  healBrokenCategoryLinks,
  resolveCategoryLink,
} from "./category-rules-validate.helper";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";
import { PatchCategoryRuleDto } from "./dto/patch-category-rule.dto";
import { SuggestCategoryRulesDto } from "./dto/suggest-category-rules.dto";

// Sender-address extraction patterns. Length-bounded ({1,320} = RFC 5321 max
// address length) so a pathological "from" header can't drive super-linear
// backtracking (CWE-1333 ReDoS).
const ANGLE_ADDR_RE = /<([^>]{1,320})>/;
const BARE_ADDR_RE = /([^\s]{1,320}@[^\s]{1,320})/;

@Injectable()
export class CategoryRulesService {
  private readonly logger = new Logger(CategoryRulesService.name);

  constructor(
    @InjectRepository(CategoryRule)
    private readonly categoryRuleRepository: Repository<CategoryRule>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private readonly userContextRepository: Repository<UserContext>,
    private readonly llmCategoriesService: LLMCategoriesService,
  ) {}

  private findCategoryId(
    userId: string,
    categoryName: string,
  ): Promise<string | null> {
    return findCategoryContextIdByName(
      this.userContextRepository,
      userId,
      categoryName,
    );
  }

  private extractDomain(from: string): string | null {
    const match = from.match(ANGLE_ADDR_RE) || from.match(BARE_ADDR_RE);
    const email = match ? match[1] : from;
    const atIdx = email.indexOf("@");
    if (atIdx < 0) return null;
    return email
      .slice(atIdx + 1)
      .toLowerCase()
      .trim();
  }

  private normaliseSender(from: string): string {
    const match = from.match(ANGLE_ADDR_RE) || from.match(BARE_ADDR_RE);
    return (match ? match[1] : from).toLowerCase().trim();
  }

  private extractSubjectPrefix(subject: string): string | null {
    const match = SUBJECT_PREFIX_REGEX.exec(subject.trim());
    return match ? `[${match[1]}]` : null;
  }

  /**
   * Counts the number of distinct email threads in the mailbox for a given
   * normalised sender address (identified via senderEmailHmac index).
   * Used to gate auto-generation behind a minimum thread threshold (issue #1714).
   */
  async countDistinctThreadsForSender(
    userId: string,
    normalisedSender: string,
  ): Promise<number> {
    return countDistinctThreadsForSenderHmac(
      this.emailRepository,
      userId,
      normalisedSender,
    );
  }

  /**
   * Builds a composite rule (sender + subject + body phrases) from the current email.
   * Used after high-confidence LLM categorisation; returns null when the email does not
   * yield three usable conditions OR the sender has fewer than
   * AUTO_GENERATE_MIN_THREAD_COUNT distinct threads (issue #1714: rules should only be
   * auto-created when they are generic enough to match many threads).
   */
  async generateCompositeRuleFromEmail(
    userId: string,
    email: EmailMetadata,
    categoryName: string,
  ): Promise<CategoryRule | null> {
    const draft = await buildDraftCompositeSpec(
      this.draftDeps(),
      userId,
      email,
      categoryName,
      {
        enforceThreadCountGate: true,
        requireDerivedExclusions: true,
      },
    );
    if (!draft) {
      return null;
    }
    return this.gateAndPersistCompositeRule(
      userId,
      draft.spec,
      draft.categoryName,
      draft.categoryId,
    );
  }

  /**
   * Builds a draft composite rule from a single email for USER review before it
   * is persisted (issue: draft-rule-from-email). Reuses the same LLM authoring +
   * exclusion-derivation as the auto path, but does NOT persist, does NOT require
   * a minimum sender thread count (the user explicitly asked for a rule), and
   * falls back to the positive-only spec when exclusions can't be auto-derived so
   * the user can add one in the review UI. Returns null only when no usable rule
   * could be drafted (no category, no sender, or no LLM phrases).
   */
  async draftCompositeRuleFromEmail(
    userId: string,
    email: EmailMetadata,
    categoryName: string,
  ): Promise<CompositeRuleDraft | null> {
    const draft = await buildDraftCompositeSpec(
      this.draftDeps(),
      userId,
      email,
      categoryName,
      {
        enforceThreadCountGate: false,
        requireDerivedExclusions: false,
        allowLlmSuggestedExclusions: true,
      },
    );
    if (!draft) {
      return null;
    }
    const v2 = specToV2(draft.spec);
    return {
      categoryName: draft.categoryName,
      senderMatchesAny: v2.senderMatchesAny,
      subjectContainsAny: v2.subjectContainsAny,
      bodyContainsAny: v2.bodyContainsAny,
      subjectNotContainsAny: v2.subjectNotContainsAny ?? [],
      bodyNotContainsAny: v2.bodyNotContainsAny ?? [],
      exclusionsDerived: draft.exclusionsDerived,
    };
  }

  /**
   * Loads an email the user owns and drafts a composite rule from it for review.
   * Thin wrapper used by `POST /category-rules/draft-from-email` so the controller
   * stays HTTP-only.
   */
  async draftCompositeRuleFromEmailId(
    userId: string,
    emailId: string,
    categoryName: string,
  ): Promise<CompositeRuleDraft | null> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });
    if (!email) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }
    return this.draftCompositeRuleFromEmail(
      userId,
      buildRuleEmailMetadata(email),
      categoryName,
    );
  }

  /**
   * Bundles the service-owned operations the draft builder needs so the
   * extraction in `category-rules-draft.helper.ts` stays decoupled from the
   * service internals.
   */
  private draftDeps(): DraftCompositeSpecDeps {
    return {
      emailRepository: this.emailRepository,
      emailThreadRepository: this.emailThreadRepository,
      llmCategoriesService: this.llmCategoriesService,
      logger: this.logger,
      normaliseSender: (raw) => this.normaliseSender(raw),
      countDistinctThreadsForSender: (userId, sender) =>
        this.countDistinctThreadsForSender(userId, sender),
      normalizeCompositeSpecDto: (dto) => this.normalizeCompositeSpecDto(dto),
      findCategoryId: (userId, categoryName) =>
        this.findCategoryId(userId, categoryName),
    };
  }

  /**
   * Reuses an exact-duplicate rule when present; otherwise runs the persist
   * gate (match → value-add → exclusion requirement) and creates the rule only
   * when it passes. Returns null when the gate rejects the candidate.
   */
  private async gateAndPersistCompositeRule(
    userId: string,
    candidateSpec: CompositeCategoryRuleSpec,
    trimmedCategory: string,
    categoryId: string | null,
  ): Promise<CategoryRule | null> {
    // Fetch composite rules once and share with both the duplicate check and
    // the persist gate (which uses them for the value-add comparison) to avoid
    // redundant queries.
    const compositeRules = await this.categoryRuleRepository.find({
      where: { userId, ruleKind: "composite" },
    });

    // Exact-duplicate rules are reused as-is (re-pointed to the new category if
    // needed) without running the value-add gate — the rule already exists.
    const duplicate = await this.findDuplicateCompositeRule(
      compositeRules,
      candidateSpec,
      trimmedCategory,
      categoryId,
    );
    if (duplicate) {
      return duplicate;
    }

    const gate = await evaluateRulePersistGate({
      categoryRuleRepository: this.categoryRuleRepository,
      emailRepository: this.emailRepository,
      llmCategoriesService: this.llmCategoriesService,
      normaliseSender: (raw) => this.normaliseSender(raw),
      userId,
      categoryName: trimmedCategory,
      categoryId,
      candidateSpec,
      compositeRules,
    });
    if (!gate.shouldPersist || !gate.finalSpec) {
      this.logger.log(
        `[CategoryRules] Skipping auto composite rule — persist gate rejected (reason=${gate.reason}${gate.detail ? `: ${gate.detail}` : ""}) for user ${userId} category="${trimmedCategory}"`,
      );
      return null;
    }

    return this.persistAutoGeneratedCompositeRule(
      userId,
      gate.finalSpec,
      trimmedCategory,
      categoryId,
    );
  }

  /**
   * Suggests composite category rules for the user by examining their email
   * history. Only senders with >= SUGGEST_MIN_THREAD_COUNT distinct threads
   * are considered so suggestions are generic enough to be useful (issue #1714).
   *
   * The caller (controller) returns these to the client for user confirmation
   * before they are persisted via the normal `createCompositeRule` path.
   */
  async suggestCategoryRules(
    userId: string,
    dto: SuggestCategoryRulesDto,
  ): Promise<CategoryRuleSuggestion[]> {
    return buildSuggestions(
      {
        email: this.emailRepository,
        rule: this.categoryRuleRepository,
        userContext: this.userContextRepository,
      },
      userId,
      dto.categoryName?.trim() ?? "",
      (raw: string) => this.normaliseSender(raw),
      this.llmCategoriesService,
    );
  }

  /**
   * Returns an existing composite rule whose spec is an exact match for `spec`
   * (re-pointing it to `trimmedCategory` when needed), or null when none match.
   * Exact duplicates are reused as-is and bypass the persist gate.
   */
  private async findDuplicateCompositeRule(
    compositeRules: CategoryRule[],
    spec: CompositeCategoryRuleSpec,
    trimmedCategory: string,
    categoryId: string | null,
  ): Promise<CategoryRule | null> {
    for (const rule of compositeRules) {
      if (!rule.compositeSpec) {
        continue;
      }
      if (!compositeAutoSpecsMatch(rule.compositeSpec, spec)) {
        continue;
      }
      if (
        rule.categoryId !== categoryId ||
        rule.categoryName !== trimmedCategory
      ) {
        rule.categoryId = categoryId;
        rule.categoryName = trimmedCategory;
        await this.categoryRuleRepository.save(rule);
        this.logger.log(
          `[CategoryRules] Updated category for existing composite rule ${rule.id} → "${trimmedCategory}"`,
        );
      }
      return rule;
    }
    return null;
  }

  private async persistAutoGeneratedCompositeRule(
    userId: string,
    spec: CompositeCategoryRuleSpec,
    trimmedCategory: string,
    categoryId: string | null,
  ): Promise<CategoryRule> {
    const created = this.categoryRuleRepository.create({
      userId,
      categoryName: trimmedCategory,
      categoryId,
      ruleKind: "composite",
      compositeSpec: spec,
      ruleType: null,
      pattern: null,
      patternHash: null,
      subjectPrefix: null,
      isEnabled: true,
      hitCount: 0,
    });
    await this.categoryRuleRepository.save(created);
    this.logger.log(
      `[CategoryRules] Created composite auto-rule ${created.id} for user ${userId} category="${trimmedCategory}"`,
    );
    return created;
  }

  normalizeCompositeSpecDto(
    dto: CreateCompositeCategoryRuleDto,
  ): CompositeCategoryRuleSpecV3 {
    return normalizeCompositeSpec(dto, (sender) =>
      this.normaliseSender(sender),
    );
  }

  async createCompositeRule(
    userId: string,
    dto: CreateCompositeCategoryRuleDto,
  ): Promise<CategoryRuleDto> {
    if (!dto.categoryName.trim()) {
      throw new BadRequestException("categoryName is required");
    }
    const spec = dropContradictoryExclusions(
      this.normalizeCompositeSpecDto(dto),
    );
    const { categoryId, categoryName } = await resolveCategoryLink(
      this.userContextRepository,
      userId,
      {
        categoryId: dto.categoryId,
        categoryName: dto.categoryName,
      },
    );
    if (categoryId === null) {
      this.logger.warn(
        `[CategoryRules] Composite rule stored with unresolved categoryId for name "${categoryName}" (user ${userId}) — the editor should send a categoryId; matching threads fall to Other until it resolves.`,
      );
    }
    if (!specHasExclusion(spec)) {
      throw new BadRequestException(
        "A composite rule must include at least one subject or body NOT-contains phrase so it cannot match too broadly. A NOT-contains phrase that duplicates a contains phrase is removed because it would never match.",
      );
    }
    const rule = this.categoryRuleRepository.create({
      userId,
      categoryName,
      categoryId,
      ruleKind: "composite",
      compositeSpec: spec,
      ruleType: null,
      pattern: null,
      patternHash: null,
      subjectPrefix: null,
      isEnabled: true,
      hitCount: 0,
    });
    await this.categoryRuleRepository.save(rule);
    await this.retroApplyRule(userId, rule);
    return this.toDto(rule);
  }

  /** See {@link retroApplyRuleIfEligible} — bound to this service's deps. */
  private async retroApplyRule(
    userId: string,
    rule: CategoryRule,
  ): Promise<void> {
    await retroApplyRuleIfEligible(
      {
        emailThreadRepository: this.emailThreadRepository,
        normaliseSender: (raw) => this.normaliseSender(raw),
        logger: this.logger,
      },
      userId,
      rule,
    );
  }

  async updateCategoryRule(
    userId: string,
    ruleId: string,
    dto: PatchCategoryRuleDto,
  ): Promise<CategoryRuleDto | null> {
    const rule = await this.categoryRuleRepository.findOne({
      where: { id: ruleId, userId },
    });
    if (!rule) return null;

    if (dto.isEnabled !== undefined) {
      rule.isEnabled = dto.isEnabled;
    }
    if (dto.categoryId !== undefined || dto.categoryName !== undefined) {
      if (dto.categoryName !== undefined && !dto.categoryName.trim()) {
        throw new BadRequestException("categoryName cannot be empty");
      }
      const { categoryId, categoryName } = await resolveCategoryLink(
        this.userContextRepository,
        userId,
        {
          categoryId: dto.categoryId,
          categoryName: dto.categoryName ?? rule.categoryName,
        },
      );
      rule.categoryId = categoryId;
      rule.categoryName = categoryName;
    }

    if (dto.compositeSpec !== undefined) {
      if (rule.ruleKind !== CATEGORY_RULE_MATCH_MODES.COMPOSITE) {
        throw new BadRequestException(
          "compositeSpec can only be set on composite rules",
        );
      }
      const spec = dropContradictoryExclusions(
        this.normalizeCompositeSpecDto({
          categoryName: rule.categoryName,
          senderMatchesAny: dto.compositeSpec.senderMatchesAny,
          fromMatchesAny: dto.compositeSpec.fromMatchesAny,
          subjectContainsAny: dto.compositeSpec.subjectContainsAny,
          bodyContainsAny: dto.compositeSpec.bodyContainsAny,
          subjectNotContainsAny: dto.compositeSpec.subjectNotContainsAny,
          bodyNotContainsAny: dto.compositeSpec.bodyNotContainsAny,
          emailIsRead: dto.compositeSpec.emailIsRead,
          emailAttachment: dto.compositeSpec.emailAttachment,
          emailReceived: dto.compositeSpec.emailReceived,
          emailRead: dto.compositeSpec.emailRead,
        }),
      );
      if (!specHasExclusion(spec)) {
        throw new BadRequestException(
          "A composite rule must include at least one subject or body NOT-contains phrase so it cannot match too broadly.",
        );
      }
      rule.compositeSpec = spec;
    }

    await this.categoryRuleRepository.save(rule);
    // Enabling or re-scoping a rule should also fix the stale threads it now
    // matches, not just future email.
    await this.retroApplyRule(userId, rule);
    return this.toDto(rule);
  }

  private buildEmailHashes(email: EmailMetadata): EmailHashes {
    return buildEmailHashes(
      email,
      (raw) => this.normaliseSender(raw),
      (raw) => this.extractDomain(raw),
      (subject) => this.extractSubjectPrefix(subject),
    );
  }

  async peekMatchingRule(
    userId: string,
    email: EmailMetadata,
  ): Promise<CategoryRuleMatch | null> {
    const [rules, { validCategoryIds, categoryIdByName }] = await Promise.all([
      this.categoryRuleRepository.find({
        where: { userId, isEnabled: true },
        order: { createdAt: "ASC" },
      }),
      loadUserCategoryIndex(this.userContextRepository, userId),
    ]);

    if (rules.length === 0) {
      return null;
    }

    const eligibleRules = this.filterEligibleRules(
      rules,
      validCategoryIds,
      categoryIdByName,
      userId,
    );

    const compositeHit = findFirstCompositeRuleMatch(
      eligibleRules,
      email,
      (raw) => this.normaliseSender(raw),
    );
    if (compositeHit) {
      return compositeHit;
    }

    return findLegacyRuleMatch(eligibleRules, this.buildEmailHashes(email));
  }

  /**
   * Keeps only rules eligible to set a category: those whose category link
   * resolves to one of the user's existing categories (by id, or by exact name
   * when the stored id was orphaned by a category regeneration — see
   * `resolveRuleCategoryId`). Rules that resolve to no current category (e.g.
   * pre-migration legacy rows, or rules for a genuinely deleted category) are
   * skipped, so a valid lower-priority rule can still win.
   *
   * Self-heal: when a rule resolves by name to a different (live) id than the one
   * it stored, its `categoryId` is re-pointed *in memory* so the resulting match
   * carries the live id (which also stops the downstream proto-fuzzy guard, keyed
   * on a null categoryId, from misfiring). The DB row is left untouched here — the
   * heal is recomputed cheaply on each run and the existing admin backfill remains
   * the path that persists re-links.
   */
  private filterEligibleRules(
    rules: CategoryRule[],
    validCategoryIds: Set<string>,
    categoryIdByName: Map<string, string>,
    userId: string,
  ): CategoryRule[] {
    return rules.filter((rule) => {
      const resolved = resolveRuleCategoryId(
        rule,
        validCategoryIds,
        categoryIdByName,
      );
      if (resolved === null) {
        this.logger.debug(
          `[CategoryRules] Skipping rule ${rule.id} (categoryId ${rule.categoryId ?? "null"} not eligible) for user ${userId}`,
        );
        return false;
      }
      if (rule.categoryId !== resolved) {
        this.logger.debug(
          `[CategoryRules] Re-linking rule ${rule.id} to current category ${resolved} by name (stored categoryId ${rule.categoryId ?? "null"} orphaned) for user ${userId}`,
        );
        rule.categoryId = resolved;
      }
      return true;
    });
  }

  async findMatchingRule(
    userId: string,
    email: EmailMetadata,
  ): Promise<CategoryRuleMatch | null> {
    const match = await this.peekMatchingRule(userId, email);
    if (!match) {
      return null;
    }

    await this.incrementHitCount(match.ruleId);
    return match;
  }

  /**
   * Like `findMatchingRule`, but also returns a compact snapshot of what the
   * rule step saw — for persisting on the thread (issue: rule-trace history).
   *
   * Computes the winner with the exact same eligibility as `peekMatchingRule`
   * (enabled, valid category, composite-first in creation order) from a SINGLE
   * fetch of all rules, plus the IDs of every other rule whose pattern matched
   * (disabled / lost / removed-category) so the debug view can explain why a
   * "matching" rule was not applied. Increments the winner's hit count once,
   * matching `findMatchingRule`'s side effect.
   */
  async findMatchingRuleWithTrace(
    userId: string,
    email: EmailMetadata,
  ): Promise<{
    match: CategoryRuleMatch | null;
    snapshot: CategoryRuleTraceSnapshot;
  }> {
    const result = await this.evaluateRulesWithTrace(userId, email);
    if (result.match) {
      await this.incrementHitCount(result.match.ruleId);
    }
    return result;
  }

  /**
   * Like `findMatchingRuleWithTrace` but WITHOUT incrementing the winning rule's
   * hit count — used by the deterministic-skip path, which records the trace for
   * the debug view but does not count a category-rule hit (it skips the LLM and
   * counts only the priority-rule hit, preserving prior behaviour).
   *
   * `preloaded` lets batch callers evaluate many emails from ONE rules+category
   * fetch instead of re-querying per email (see loadRuleEvaluationSet).
   */
  async peekMatchingRuleWithTrace(
    userId: string,
    email: EmailMetadata,
    preloaded?: CategoryRuleEvaluationSet,
  ): Promise<{
    match: CategoryRuleMatch | null;
    snapshot: CategoryRuleTraceSnapshot;
  }> {
    return this.evaluateRulesWithTrace(userId, email, preloaded);
  }

  /** See {@link loadRuleEvaluationSet} in the evaluation-set helper. */
  async loadRuleEvaluationSet(
    userId: string,
  ): Promise<CategoryRuleEvaluationSet> {
    return loadRuleEvaluationSet(
      this.categoryRuleRepository,
      this.userContextRepository,
      userId,
    );
  }

  /**
   * Computes the winning rule and a trace snapshot from a single fetch of all
   * rules, with no side effects. Callers decide whether to increment hit counts.
   */
  private async evaluateRulesWithTrace(
    userId: string,
    email: EmailMetadata,
    preloaded?: CategoryRuleEvaluationSet,
  ): Promise<{
    match: CategoryRuleMatch | null;
    snapshot: CategoryRuleTraceSnapshot;
  }> {
    const { rules, validCategoryIds, categoryIdByName } =
      preloaded ?? (await this.loadRuleEvaluationSet(userId));

    const evaluatedAt = new Date().toISOString();
    const enabledRules = rules.filter((rule) => rule.isEnabled);
    const eligibleRules = this.filterEligibleRules(
      enabledRules,
      validCategoryIds,
      categoryIdByName,
      userId,
    );
    const hashes = this.buildEmailHashes(email);
    const match =
      findFirstCompositeRuleMatch(eligibleRules, email, (raw) =>
        this.normaliseSender(raw),
      ) ?? findLegacyRuleMatch(eligibleRules, hashes);

    const matchedButNotWinningRuleIds = collectMatchingRuleIds(
      rules,
      email,
      hashes,
      (raw) => this.normaliseSender(raw),
    ).filter((ruleId) => ruleId !== match?.ruleId);

    return {
      match,
      snapshot: {
        evaluatedAt,
        ruleStepRan: true,
        rulesConsideredCount: rules.length,
        winningRuleId: match?.ruleId ?? null,
        winningRuleCategoryName: match?.categoryName ?? null,
        matchedButNotWinningRuleIds,
      },
    };
  }

  async getDeterministicRulesDebug(
    userId: string,
    email: EmailMetadata,
  ): Promise<DeterministicRulesDebug> {
    const [rules, winningRule, { validCategoryIds, categoryIdByName }] =
      await Promise.all([
        this.categoryRuleRepository.find({
          where: { userId },
          order: { createdAt: "DESC" },
        }),
        this.peekMatchingRule(userId, email),
        loadUserCategoryIndex(this.userContextRepository, userId),
      ]);

    const hashes = this.buildEmailHashes(email);
    const evaluations: CategoryRuleEvaluationDebug[] = rules.map((rule) =>
      buildRuleEvaluationDebug({
        rule,
        email,
        hashes,
        isWinningRule: winningRule?.ruleId === rule.id,
        categoryExists: (() => {
          // Heal the in-memory link so the debug row's reported categoryId
          // matches the resolved category (and the winning rule), rather than
          // showing categoryExists:true alongside an orphaned/null id.
          const resolved = resolveRuleCategoryId(
            rule,
            validCategoryIds,
            categoryIdByName,
          );
          if (resolved && rule.categoryId !== resolved) {
            rule.categoryId = resolved;
          }
          return resolved !== null;
        })(),
        normaliseSender: (raw) => this.normaliseSender(raw),
      }),
    );

    return { winningRule, evaluations };
  }

  private async incrementHitCount(ruleId: string): Promise<void> {
    await this.categoryRuleRepository.increment({ id: ruleId }, "hitCount", 1);
  }

  async listRules(userId: string): Promise<CategoryRuleDto[]> {
    const rules = await this.categoryRuleRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
    // Re-link any rules whose categoryId is null (best-effort; never throws).
    await healBrokenCategoryLinks(
      this.categoryRuleRepository,
      this.userContextRepository,
      userId,
      rules,
      this.logger,
    );
    return rules.map((rule) => this.toDto(rule));
  }

  async deleteRule(userId: string, ruleId: string): Promise<boolean> {
    const result = await this.categoryRuleRepository.delete({
      id: ruleId,
      userId,
    });
    return (result.affected ?? 0) > 0;
  }

  private toDto(rule: CategoryRule): CategoryRuleDto {
    return {
      id: rule.id,
      categoryName: rule.categoryName,
      categoryId: rule.categoryId,
      ruleKind: rule.ruleKind,
      ruleType: rule.ruleType,
      pattern: rule.pattern ?? "",
      subjectPrefix: rule.subjectPrefix,
      compositeSpec:
        rule.ruleKind === CATEGORY_RULE_MATCH_MODES.COMPOSITE
          ? rule.compositeSpec
          : null,
      isEnabled: rule.isEnabled,
      hitCount: rule.hitCount,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}
