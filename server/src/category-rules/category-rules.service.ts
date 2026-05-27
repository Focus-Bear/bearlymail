import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  CATEGORY_RULE_KINDS,
  CATEGORY_RULE_MATCH_MODES,
} from "../constants/domain-types";
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
import { parseCategoryName } from "../utils/category-name.util";
import { computeEmailHmac } from "../utils/hmac-email";
import type {
  CategoryRuleDto,
  CategoryRuleEvaluationDebug,
  CategoryRuleMatch,
  CategoryRuleSuggestion,
  CompositeRuleEvaluationDetail,
  DeterministicRulesDebug,
  EmailMetadata,
} from "./category-rules.types";
import {
  compositeAutoSpecsMatch,
  EmailHashes,
  evaluateComposite,
  rulePatternMatches,
} from "./category-rules-auto-composite.helper";
import { deriveExclusionsForCompositeRule } from "./category-rules-derive-exclusions.helper";
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

    const existing = await this.categoryRuleRepository.findOne({
      where: { userId, ruleType, patternHash, ruleKind: "legacy" },
    });

    if (existing) {
      if (existing.categoryName !== categoryName) {
        this.logger.log(
          `[CategoryRules] Updating category for existing rule ${existing.id}: "${existing.categoryName}" → "${categoryName}"`,
        );
        existing.categoryName = categoryName;
        await this.categoryRuleRepository.save(existing);
      }
      return existing;
    }

    const rule = this.categoryRuleRepository.create({
      userId,
      categoryName,
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
          select: ["subject", "body"],
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

    const outcome = await deriveExclusionsForCompositeRule({
      emailThreadRepository: this.emailThreadRepository,
      userContextRepository: this.userContextRepository,
      llmCategoriesService: this.llmCategoriesService,
      normaliseSender: (raw) => this.normaliseSender(raw),
      userId,
      positiveSpec,
      categoryName: trimmedCategory,
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
  ): Promise<CategoryRule | null> {
    for (const rule of compositeRules) {
      if (!rule.compositeSpec) {
        continue;
      }
      if (!compositeAutoSpecsMatch(rule.compositeSpec, spec)) {
        continue;
      }
      if (rule.categoryName !== trimmedCategory) {
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
  ): Promise<CategoryRule> {
    const created = this.categoryRuleRepository.create({
      userId,
      categoryName: trimmedCategory,
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
    if (!specHasExclusion(spec)) {
      throw new BadRequestException(
        "A composite rule must include at least one subject or body NOT-contains phrase so it cannot match too broadly. A NOT-contains phrase that duplicates a contains phrase is removed because it would never match.",
      );
    }
    const rule = this.categoryRuleRepository.create({
      userId,
      categoryName,
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
    const normalisedSender = this.normaliseSender(email.from);
    const domain = this.extractDomain(email.from);
    const subjectPrefix = this.extractSubjectPrefix(email.subject);
    const senderHash = SearchIndexHelper.hashExact(normalisedSender);
    const domainPattern = domain ? `@${domain}` : null;
    const domainHash = domainPattern
      ? SearchIndexHelper.hashExact(domainPattern)
      : null;
    const prefixHash = subjectPrefix
      ? SearchIndexHelper.hashExact(subjectPrefix.toLowerCase())
      : null;
    return { senderHash, domainPattern, domainHash, subjectPrefix, prefixHash };
  }

  async peekMatchingRule(
    userId: string,
    email: EmailMetadata,
  ): Promise<CategoryRuleMatch | null> {
    const [rules, validCategoryNames] = await Promise.all([
      this.categoryRuleRepository.find({
        where: { userId, isEnabled: true },
        order: { createdAt: "ASC" },
      }),
      this.getUserCategoryNames(userId),
    ]);

    if (rules.length === 0) {
      return null;
    }

    // When the user has categories defined, skip rules pointing to deleted categories
    // so that a valid lower-priority rule can still win (rather than returning null).
    const eligibleRules =
      validCategoryNames.size > 0
        ? rules.filter((rule) => {
            if (!validCategoryNames.has(rule.categoryName)) {
              this.logger.warn(
                `[CategoryRules] Skipping rule ${rule.id} (category "${rule.categoryName}" no longer exists) for user ${userId}`,
              );
              return false;
            }
            return true;
          })
        : rules;

    const compositeHit = this.findFirstCompositeRuleMatch(eligibleRules, email);
    if (compositeHit) {
      return compositeHit;
    }

    return this.findLegacyRuleMatch(eligibleRules, email);
  }

  private findFirstCompositeRuleMatch(
    rules: CategoryRule[],
    email: EmailMetadata,
  ): CategoryRuleMatch | null {
    for (const rule of rules) {
      if (rule.ruleKind !== CATEGORY_RULE_MATCH_MODES.COMPOSITE) {
        continue;
      }
      const spec = rule.compositeSpec;
      if (
        !spec ||
        (spec.v !== CATEGORY_RULE_COMPOSITE.SPEC_VERSION &&
          spec.v !== CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V2 &&
          spec.v !== CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V1)
      ) {
        continue;
      }
      const { matches } = evaluateComposite(spec, email, (raw) =>
        this.normaliseSender(raw),
      );
      if (matches) {
        return {
          categoryName: rule.categoryName,
          ruleId: rule.id,
          ruleType: null,
          ruleKind: "composite",
        };
      }
    }
    return null;
  }

  private findLegacyRuleMatch(
    rules: CategoryRule[],
    email: EmailMetadata,
  ): CategoryRuleMatch | null {
    const legacyRules = rules.filter(
      (rule) =>
        rule.ruleKind === CATEGORY_RULE_KINDS.LEGACY &&
        rule.ruleType != null &&
        rule.patternHash != null,
    );

    const hashes = this.buildEmailHashes(email);
    type RuleKey = string;
    const ruleMap = new Map<RuleKey, CategoryRule>();
    for (const rule of legacyRules) {
      ruleMap.set(`${rule.ruleType}:${rule.patternHash}`, rule);
    }

    return this.lookupLegacyRuleInMap(ruleMap, hashes);
  }

  private lookupLegacyRuleInMap(
    ruleMap: Map<string, CategoryRule>,
    hashes: EmailHashes,
  ): CategoryRuleMatch | null {
    const { senderHash, domainPattern, domainHash, subjectPrefix, prefixHash } =
      hashes;

    const toLegacyMatch = (rule: CategoryRule): CategoryRuleMatch => ({
      categoryName: rule.categoryName,
      ruleId: rule.id,
      ruleType: rule.ruleType,
      ruleKind: "legacy",
    });

    const exactMatch = ruleMap.get(`exact_sender:${senderHash}`);
    if (exactMatch) {
      return toLegacyMatch(exactMatch);
    }

    if (domainPattern && subjectPrefix) {
      const combinedHashInput = `${domainPattern.toLowerCase()}|${subjectPrefix.toLowerCase()}`;
      const combinedHash = SearchIndexHelper.hashExact(combinedHashInput);
      const combinedMatch = ruleMap.get(
        `sender_domain_and_subject_prefix:${combinedHash}`,
      );
      if (combinedMatch) {
        return toLegacyMatch(combinedMatch);
      }
    }

    if (domainHash) {
      const domainMatch = ruleMap.get(`sender_domain:${domainHash}`);
      if (domainMatch) {
        return toLegacyMatch(domainMatch);
      }
    }

    if (prefixHash) {
      const prefixMatch = ruleMap.get(`subject_prefix:${prefixHash}`);
      if (prefixMatch) {
        return toLegacyMatch(prefixMatch);
      }
    }

    return null;
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

  private async getUserCategoryNames(userId: string): Promise<Set<string>> {
    const contexts = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: ["contextValue"],
    });
    return new Set(contexts.map((ctx) => parseCategoryName(ctx.contextValue)));
  }

  async getDeterministicRulesDebug(
    userId: string,
    email: EmailMetadata,
  ): Promise<DeterministicRulesDebug> {
    const [rules, winningRule] = await Promise.all([
      this.categoryRuleRepository.find({
        where: { userId },
        order: { createdAt: "DESC" },
      }),
      this.peekMatchingRule(userId, email),
    ]);

    const hashes = this.buildEmailHashes(email);
    const evaluations: CategoryRuleEvaluationDebug[] = rules.map((rule) => {
      if (rule.ruleKind === CATEGORY_RULE_MATCH_MODES.COMPOSITE) {
        const spec = rule.compositeSpec;
        let patternMatches = false;
        let compositeDetail: CompositeRuleEvaluationDetail | undefined;
        if (
          spec &&
          (spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION ||
            spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V2 ||
            spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V1)
        ) {
          const ev = evaluateComposite(spec, email, (raw) =>
            this.normaliseSender(raw),
          );
          patternMatches = ev.matches;
          compositeDetail = ev.detail;
        }
        return {
          id: rule.id,
          ruleKind: "composite",
          ruleType: null,
          categoryName: rule.categoryName,
          pattern: "",
          subjectPrefix: null,
          isEnabled: rule.isEnabled,
          hitCount: rule.hitCount,
          patternMatches,
          isWinningRule: winningRule?.ruleId === rule.id,
          compositeDetail,
        };
      }

      const patternMatches = rulePatternMatches(rule, hashes);
      return {
        id: rule.id,
        ruleKind: "legacy",
        ruleType: rule.ruleType,
        categoryName: rule.categoryName,
        pattern: rule.pattern || "",
        subjectPrefix: rule.subjectPrefix,
        isEnabled: rule.isEnabled,
        hitCount: rule.hitCount,
        patternMatches,
        isWinningRule: winningRule?.ruleId === rule.id,
      };
    });

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
