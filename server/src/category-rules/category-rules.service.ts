import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CATEGORY_RULE_MATCH_MODES } from "../constants/domain-types";
import { SearchIndexHelper } from "../contacts/search-index.helper";
import {
  CategoryRule,
  CategoryRuleType,
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import { computeEmailHmac } from "../utils/hmac-email";
import type {
  CategoryRuleDto,
  CategoryRuleEvaluationDebug,
  CategoryRuleMatch,
  CategoryRuleSuggestion,
  CategoryRuleTraceSnapshot,
  DeterministicRulesDebug,
  EmailMetadata,
} from "./category-rules.types";
import {
  compositeAutoSpecsMatch,
  EmailHashes,
} from "./category-rules-auto-composite.helper";
import { deriveExclusionsForCompositeRule } from "./category-rules-derive-exclusions.helper";
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
import {
  AUTOMATED_PREFIXES,
  GENERIC_DOMAINS,
  SUBJECT_PREFIX_REGEX,
} from "./category-rules-sender.constants";
import { normalizeCompositeSpec } from "./category-rules-spec-normalizer.helper";
import {
  buildSuggestions,
  countDistinctThreadsForSenderHmac,
} from "./category-rules-suggest.helper";
import {
  buildRuleEvaluationDebug,
  categoryLinkIsValid,
  collectMatchingRuleIds,
} from "./category-rules-trace.helper";
import { findCategoryContextIdByName } from "./category-rules-validate.helper";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";
import { PatchCategoryRuleDto } from "./dto/patch-category-rule.dto";
import { SuggestCategoryRulesDto } from "./dto/suggest-category-rules.dto";

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
    const match = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/);
    const email = match ? match[1] : from;
    const atIdx = email.indexOf("@");
    if (atIdx < 0) return null;
    return email
      .slice(atIdx + 1)
      .toLowerCase()
      .trim();
  }

  private normaliseSender(from: string): string {
    const match = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/);
    return (match ? match[1] : from).toLowerCase().trim();
  }

  private isAutomatedSender(normalised: string): boolean {
    const localPart = `${normalised.split("@")[0]}@`;
    return AUTOMATED_PREFIXES.some((prefix) => localPart.startsWith(prefix));
  }

  private extractSubjectPrefix(subject: string): string | null {
    const match = SUBJECT_PREFIX_REGEX.exec(subject.trim());
    return match ? `[${match[1]}]` : null;
  }

  private buildRuleParams(
    userId: string,
    email: EmailMetadata,
    normalisedSender: string,
    domain: string,
  ): {
    ruleType: CategoryRuleType;
    pattern: string;
    subjectPrefix: string | null;
    patternHash: string;
  } | null {
    const isGenericDomain = GENERIC_DOMAINS.has(domain);
    const isAutomated = this.isAutomatedSender(normalisedSender);
    const subjectPrefix = this.extractSubjectPrefix(email.subject);

    let ruleType: CategoryRuleType;
    let pattern: string;
    let subjectPrefixToStore: string | null = null;

    if (isAutomated) {
      ruleType = "exact_sender";
      pattern = normalisedSender;
    } else if (!isGenericDomain && subjectPrefix) {
      ruleType = "sender_domain_and_subject_prefix";
      pattern = `@${domain}`;
      subjectPrefixToStore = subjectPrefix;
    } else if (!isGenericDomain) {
      ruleType = "sender_domain";
      pattern = `@${domain}`;
    } else if (subjectPrefix) {
      ruleType = "subject_prefix";
      pattern = subjectPrefix;
    } else {
      this.logger.debug(
        `[CategoryRules] Generic domain "${domain}" with no subject prefix — skipping rule generation for user ${userId}`,
      );
      return null;
    }

    const hashInput =
      ruleType === CATEGORY_RULE_MATCH_MODES.SENDER_DOMAIN_AND_SUBJECT_PREFIX &&
      subjectPrefixToStore
        ? `${pattern.toLowerCase()}|${subjectPrefixToStore.toLowerCase()}`
        : pattern.toLowerCase();

    return {
      ruleType,
      pattern,
      subjectPrefix: subjectPrefixToStore,
      patternHash: SearchIndexHelper.hashExact(hashInput),
    };
  }

  async generateRuleFromEmail(
    userId: string,
    email: EmailMetadata,
    categoryName: string,
  ): Promise<CategoryRule | null> {
    const normalisedSender = this.normaliseSender(email.from);
    const domain = this.extractDomain(email.from);

    if (!domain) {
      this.logger.debug(
        `[CategoryRules] Could not extract domain from "${email.from}" — skipping rule generation`,
      );
      return null;
    }

    const ruleParams = this.buildRuleParams(
      userId,
      email,
      normalisedSender,
      domain,
    );
    if (!ruleParams) return null;

    const {
      ruleType,
      pattern,
      subjectPrefix: subjectPrefixToStore,
      patternHash,
    } = ruleParams;

    const [existing, categoryId] = await Promise.all([
      this.categoryRuleRepository.findOne({
        where: { userId, ruleType, patternHash, ruleKind: "legacy" },
      }),
      this.findCategoryId(userId, categoryName),
    ]);

    if (existing) {
      if (
        existing.categoryName !== categoryName ||
        existing.categoryId !== categoryId
      ) {
        this.logger.log(
          `[CategoryRules] Updating category for existing rule ${existing.id}: "${existing.categoryName}" → "${categoryName}"`,
        );
        existing.categoryName = categoryName;
        existing.categoryId = categoryId;
        await this.categoryRuleRepository.save(existing);
      }
      return existing;
    }

    const rule = this.categoryRuleRepository.create({
      userId,
      categoryName,
      categoryId,
      ruleType,
      pattern,
      patternHash,
      subjectPrefix: subjectPrefixToStore,
      ruleKind: "legacy",
      isEnabled: true,
      hitCount: 0,
    });

    await this.categoryRuleRepository.save(rule);
    this.logger.log(
      `[CategoryRules] Created rule ${rule.id} for user ${userId}: type=${ruleType} pattern="${pattern}" category="${categoryName}"`,
    );
    return rule;
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
    const trimmedCategory = categoryName?.trim();
    if (!trimmedCategory) {
      return null;
    }

    const sender = this.normaliseSender(email.from);
    if (!sender) {
      return null;
    }

    // Issue #1714: only auto-generate rules for senders with enough thread history.
    const threadCount = await this.countDistinctThreadsForSender(
      userId,
      sender,
    );
    if (threadCount < CATEGORY_RULE_COMPOSITE.AUTO_GENERATE_MIN_THREAD_COUNT) {
      this.logger.debug(
        `[CategoryRules] Skipping auto composite rule — sender "${sender}" has only ${threadCount} threads (< ${CATEGORY_RULE_COMPOSITE.AUTO_GENERATE_MIN_THREAD_COUNT}) for user ${userId}`,
      );
      return null;
    }

    // Fetch recent emails from this sender to give the LLM enough context for
    // generic pattern extraction (issue #1714: no more verbatim phrases).
    const senderHmac = computeEmailHmac(sender);
    const sampleEmails = senderHmac
      ? await this.emailRepository.find({
          where: { userId, senderEmailHmac: senderHmac },
          order: { receivedAt: "DESC" },
          take: CATEGORY_RULE_COMPOSITE.SUGGEST_SAMPLE_EMAILS_PER_SENDER,
          select: {
            subject: true,
            body: true,
          },
        })
      : [];

    // Always include the current email so the LLM has at least one sample.
    const samples: Array<{ subject: string; body: string }> = [
      { subject: email.subject || "", body: email.bodyTextForMatch || "" },
      ...sampleEmails.map((emailSample) => ({
        subject: emailSample.subject || "",
        body: emailSample.body || "",
      })),
    ];

    // Pass the sender email to the LLM so it can decide on the best pattern
    // (exact address or domain wildcard like *@github.com).
    const llmResult =
      await this.llmCategoriesService.suggestRulesFromEmailSamples(
        trimmedCategory,
        [sender],
        samples,
      );

    if (
      !llmResult ||
      llmResult.subjectContainsAny.length === 0 ||
      llmResult.bodyContainsAny.length === 0
    ) {
      this.logger.debug(
        `[CategoryRules] Skipping auto composite rule — LLM returned no usable phrases for user ${userId}`,
      );
      return null;
    }

    const senderMatchesAny =
      llmResult.fromMatchesAny.length > 0 ? llmResult.fromMatchesAny : [sender];

    // Issue #1789 follow-up: the LLM no longer returns
    // subjectNotContainsAny / bodyNotContainsAny — we derive them from real
    // false positives below. Build the positive-only spec first.
    let positiveSpec: CompositeCategoryRuleSpec;
    try {
      positiveSpec = this.normalizeCompositeSpecDto({
        categoryName: trimmedCategory,
        senderMatchesAny,
        subjectContainsAny: llmResult.subjectContainsAny.slice(
          0,
          CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES,
        ),
        bodyContainsAny: llmResult.bodyContainsAny.slice(
          0,
          CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASES,
        ),
      });
    } catch {
      return null;
    }

    const categoryId = await this.findCategoryId(userId, trimmedCategory);

    const outcome = await deriveExclusionsForCompositeRule({
      emailThreadRepository: this.emailThreadRepository,
      llmCategoriesService: this.llmCategoriesService,
      normaliseSender: (raw) => this.normaliseSender(raw),
      userId,
      positiveSpec,
      categoryName: trimmedCategory,
      categoryId,
    });
    if (!outcome.passes || !outcome.finalSpec) {
      this.logger.debug(
        `[CategoryRules] Skipping auto composite rule — validation failed after derive-exclusions (truePositives=${outcome.truePositives}, falsePositives=${outcome.falsePositives}) for user ${userId} category="${trimmedCategory}"`,
      );
      return null;
    }

    return this.gateAndPersistCompositeRule(
      userId,
      outcome.finalSpec,
      trimmedCategory,
      categoryId,
    );
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
      this.logger.debug(
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
    const categoryName = dto.categoryName.trim();
    if (!categoryName) {
      throw new BadRequestException("categoryName is required");
    }
    const spec = dropContradictoryExclusions(
      this.normalizeCompositeSpecDto(dto),
    );
    const categoryId = await this.findCategoryId(userId, categoryName);
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
    return this.toDto(rule);
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
    if (dto.categoryName !== undefined) {
      const name = dto.categoryName.trim();
      if (!name) {
        throw new BadRequestException("categoryName cannot be empty");
      }
      rule.categoryName = name;
      rule.categoryId = await this.findCategoryId(userId, name);
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
    const [rules, validCategoryIds] = await Promise.all([
      this.categoryRuleRepository.find({
        where: { userId, isEnabled: true },
        order: { createdAt: "ASC" },
      }),
      this.getUserCategoryIds(userId),
    ]);

    if (rules.length === 0) {
      return null;
    }

    const eligibleRules = this.filterEligibleRules(
      rules,
      validCategoryIds,
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
   * Keeps only rules eligible to set a category: those whose `categoryId` still
   * points at one of the user's existing categories. Rules with no categoryId
   * (legacy rows created before rules carried a category UUID) can never
   * resolve to a real category, so they are always skipped — even for users
   * who have no categories at all. Rules pointing at a deleted category are
   * skipped when we know the user's categories, so a valid lower-priority rule
   * can still win. If the valid set is empty (e.g. a transient read), keep
   * rules that do carry a categoryId rather than dropping all matches.
   */
  private filterEligibleRules(
    rules: CategoryRule[],
    validCategoryIds: Set<string>,
    userId: string,
  ): CategoryRule[] {
    return rules.filter((rule) => {
      if (categoryLinkIsValid(rule, validCategoryIds)) {
        return true;
      }
      this.logger.debug(
        `[CategoryRules] Skipping rule ${rule.id} (categoryId ${rule.categoryId ?? "null"} not eligible) for user ${userId}`,
      );
      return false;
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
    const [rules, validCategoryIds] = await Promise.all([
      this.categoryRuleRepository.find({
        where: { userId },
        order: { createdAt: "ASC" },
      }),
      this.getUserCategoryIds(userId),
    ]);

    const evaluatedAt = new Date().toISOString();
    const enabledRules = rules.filter((rule) => rule.isEnabled);
    const eligibleRules = this.filterEligibleRules(
      enabledRules,
      validCategoryIds,
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

    if (match) {
      await this.incrementHitCount(match.ruleId);
    }

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

  private async getUserCategoryIds(userId: string): Promise<Set<string>> {
    const contexts = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: {
        contextId: true,
      },
    });
    return new Set(contexts.map((ctx) => ctx.contextId));
  }

  async getDeterministicRulesDebug(
    userId: string,
    email: EmailMetadata,
  ): Promise<DeterministicRulesDebug> {
    const [rules, winningRule, validCategoryIds] = await Promise.all([
      this.categoryRuleRepository.find({
        where: { userId },
        order: { createdAt: "DESC" },
      }),
      this.peekMatchingRule(userId, email),
      this.getUserCategoryIds(userId),
    ]);

    const hashes = this.buildEmailHashes(email);
    const evaluations: CategoryRuleEvaluationDebug[] = rules.map((rule) =>
      buildRuleEvaluationDebug({
        rule,
        email,
        hashes,
        isWinningRule: winningRule?.ruleId === rule.id,
        categoryExists: categoryLinkIsValid(rule, validCategoryIds),
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
