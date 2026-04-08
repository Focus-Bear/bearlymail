import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  CATEGORY_RULE_KINDS,
  CATEGORY_RULE_MATCH_MODES,
  CATEGORY_RULE_TYPES,
} from "../constants/domain-types";
import { SearchIndexHelper } from "../contacts/search-index.helper";
import {
  CategoryRule,
  CategoryRuleKind,
  CategoryRuleType,
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV1,
  CompositeCategoryRuleSpecV2,
} from "../database/entities/category-rule.entity";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";
import { PatchCategoryRuleDto } from "./dto/patch-category-rule.dto";

const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "yandex.com",
  "yandex.ru",
  "mail.com",
  "zoho.com",
  "fastmail.com",
]);

const AUTOMATED_PREFIXES = [
  "noreply@",
  "no-reply@",
  "notifications@",
  "notification@",
  "alerts@",
  "alert@",
  "do-not-reply@",
  "donotreply@",
  "mailer@",
  "bounces@",
  "postmaster@",
  "support@",
  "info@",
  "hello@",
  "news@",
  "newsletter@",
];

const SUBJECT_PREFIX_REGEX = /^\[([^\]]{1,30})\]/;

export interface EmailMetadata {
  from: string;
  subject: string;
  /** Plain cleaned body slice for composite rule matching (optional). */
  bodyTextForMatch?: string;
}

export interface CategoryRuleMatch {
  categoryName: string;
  ruleId: string;
  ruleType: CategoryRuleType | null;
  ruleKind: CategoryRuleKind;
}

export interface CategoryRuleDto {
  id: string;
  categoryName: string;
  ruleKind: CategoryRuleKind;
  ruleType: CategoryRuleType | null;
  pattern: string;
  subjectPrefix: string | null;
  compositeSpec: CompositeCategoryRuleSpec | null;
  isEnabled: boolean;
  hitCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompositeRuleEvaluationDetail {
  senderMatch: boolean;
  subjectMatch: boolean;
  bodyMatch: boolean;
  bodyMatchedPhrase: string | null;
  /** Which sender value matched (v2 rules with multiple senders). */
  senderMatchedValue: string | null;
  /** Which subject phrase matched (v2 rules with multiple subject phrases). */
  subjectMatchedValue: string | null;
}

export interface CategoryRuleEvaluationDebug {
  id: string;
  ruleKind: CategoryRuleKind;
  ruleType: CategoryRuleType | null;
  categoryName: string;
  pattern: string;
  subjectPrefix: string | null;
  isEnabled: boolean;
  hitCount: number;
  patternMatches: boolean;
  isWinningRule: boolean;
  compositeDetail?: CompositeRuleEvaluationDetail;
}

export interface DeterministicRulesDebug {
  winningRule: CategoryRuleMatch | null;
  evaluations: CategoryRuleEvaluationDebug[];
}

@Injectable()
export class CategoryRulesService {
  private readonly logger = new Logger(CategoryRulesService.name);

  constructor(
    @InjectRepository(CategoryRule)
    private readonly categoryRuleRepository: Repository<CategoryRule>,
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

  normalizeCompositeSpecDto(
    dto: CreateCompositeCategoryRuleDto,
  ): CompositeCategoryRuleSpecV2 {
    const senderMatchesAny = dto.senderMatchesAny
      .map((senderRaw) => this.normaliseSender(senderRaw))
      .filter(Boolean);
    const subjectContainsAny = dto.subjectContainsAny
      .map((subjectPhrase) => subjectPhrase.trim())
      .filter(Boolean);
    const bodyContainsAny = dto.bodyContainsAny
      .map((phrase) => phrase.trim())
      .filter(Boolean);
    if (senderMatchesAny.length === 0) {
      throw new BadRequestException(
        "senderMatchesAny must contain at least one non-empty sender",
      );
    }
    // Defence-in-depth: class-validator @ArrayMaxSize already rejects oversized arrays before
    // this method is reached, but we duplicate the check here so the service layer is safe
    // even if called without the DTO validation pipeline.
    if (senderMatchesAny.length > CATEGORY_RULE_COMPOSITE.MAX_SENDERS) {
      throw new BadRequestException(
        `At most ${CATEGORY_RULE_COMPOSITE.MAX_SENDERS} senders allowed`,
      );
    }
    if (subjectContainsAny.length === 0) {
      throw new BadRequestException(
        "subjectContainsAny must contain at least one non-empty phrase",
      );
    }
    // Defence-in-depth: same rationale as the sender guard above.
    if (
      subjectContainsAny.length > CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES
    ) {
      throw new BadRequestException(
        `At most ${CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES} subject phrases allowed`,
      );
    }
    if (bodyContainsAny.length === 0) {
      throw new BadRequestException(
        "bodyContainsAny must contain at least one non-empty phrase",
      );
    }
    if (bodyContainsAny.length > CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASES) {
      throw new BadRequestException(
        `At most ${CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASES} body phrases allowed`,
      );
    }
    return {
      v: CATEGORY_RULE_COMPOSITE.SPEC_VERSION,
      senderMatchesAny,
      subjectContainsAny,
      bodyContainsAny,
    };
  }

  async createCompositeRule(
    userId: string,
    dto: CreateCompositeCategoryRuleDto,
  ): Promise<CategoryRuleDto> {
    const categoryName = dto.categoryName.trim();
    if (!categoryName) {
      throw new BadRequestException("categoryName is required");
    }
    const spec = this.normalizeCompositeSpecDto(dto);
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
      const spec = this.normalizeCompositeSpecDto({
        categoryName: rule.categoryName,
        senderMatchesAny: dto.compositeSpec.senderMatchesAny,
        subjectContainsAny: dto.compositeSpec.subjectContainsAny,
        bodyContainsAny: dto.compositeSpec.bodyContainsAny,
      });
      rule.compositeSpec = spec;
    }

    await this.categoryRuleRepository.save(rule);
    return this.toDto(rule);
  }

  private buildEmailHashes(email: EmailMetadata): {
    senderHash: string;
    domainPattern: string | null;
    domainHash: string | null;
    subjectPrefix: string | null;
    prefixHash: string | null;
  } {
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

  /** Normalise a v1 spec into the v2 array shape for unified evaluation. */
  private specToV2(
    spec: CompositeCategoryRuleSpecV1 | CompositeCategoryRuleSpecV2,
  ): CompositeCategoryRuleSpecV2 {
    if (spec.v === 2) {
      return spec;
    }
    return {
      v: 2,
      senderMatchesAny: [spec.sender],
      subjectContainsAny: [spec.subjectContains],
      bodyContainsAny: spec.bodyContainsAny,
    };
  }

  private evaluateComposite(
    spec: CompositeCategoryRuleSpecV1 | CompositeCategoryRuleSpecV2,
    email: EmailMetadata,
  ): { matches: boolean; detail: CompositeRuleEvaluationDetail } {
    const v2 = this.specToV2(spec);
    const normFrom = this.normaliseSender(email.from);

    let senderOk = false;
    let senderMatchedValue: string | null = null;
    for (const sender of v2.senderMatchesAny) {
      if (this.normaliseSender(sender) === normFrom) {
        senderOk = true;
        senderMatchedValue = sender;
        break;
      }
    }

    const subj = (email.subject || "").toLowerCase();
    let subjectOk = false;
    let subjectMatchedValue: string | null = null;
    for (const phrase of v2.subjectContainsAny) {
      const needle = phrase.trim().toLowerCase();
      if (needle.length > 0 && subj.includes(needle)) {
        subjectOk = true;
        subjectMatchedValue = phrase;
        break;
      }
    }

    const body = (email.bodyTextForMatch || "").toLowerCase();
    const phrases = v2.bodyContainsAny
      .map((phrase) => phrase.trim())
      .filter(Boolean);
    let bodyMatchedPhrase: string | null = null;
    const bodyOk = phrases.some((phrase) => {
      const lowerPhrase = phrase.toLowerCase();
      if (lowerPhrase && body.includes(lowerPhrase)) {
        bodyMatchedPhrase = phrase;
        return true;
      }
      return false;
    });
    return {
      matches: senderOk && subjectOk && bodyOk,
      detail: {
        senderMatch: senderOk,
        subjectMatch: subjectOk,
        bodyMatch: bodyOk,
        bodyMatchedPhrase,
        senderMatchedValue,
        subjectMatchedValue,
      },
    };
  }

  async peekMatchingRule(
    userId: string,
    email: EmailMetadata,
  ): Promise<CategoryRuleMatch | null> {
    const rules = await this.categoryRuleRepository.find({
      where: { userId, isEnabled: true },
      order: { createdAt: "ASC" },
    });

    if (rules.length === 0) {
      return null;
    }

    const compositeHit = this.findFirstCompositeRuleMatch(rules, email);
    if (compositeHit) {
      return compositeHit;
    }

    return this.findLegacyRuleMatch(rules, email);
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
          spec.v !== CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V1)
      ) {
        continue;
      }
      const { matches } = this.evaluateComposite(spec, email);
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
    hashes: ReturnType<CategoryRulesService["buildEmailHashes"]>,
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
    if (match) {
      await this.incrementHitCount(match.ruleId);
    }
    return match;
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
            spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V1)
        ) {
          const ev = this.evaluateComposite(spec, email);
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

      const patternMatches = this.rulePatternMatches(rule, hashes);
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

  private rulePatternMatches(
    rule: Pick<CategoryRule, "ruleType" | "patternHash" | "ruleKind">,
    hashes: ReturnType<CategoryRulesService["buildEmailHashes"]>,
  ): boolean {
    if (
      rule.ruleKind !== CATEGORY_RULE_KINDS.LEGACY ||
      !rule.ruleType ||
      !rule.patternHash
    ) {
      return false;
    }
    const { senderHash, domainPattern, domainHash, subjectPrefix, prefixHash } =
      hashes;
    if (rule.ruleType === CATEGORY_RULE_TYPES.EXACT_SENDER) {
      return rule.patternHash === senderHash;
    }
    if (rule.ruleType === CATEGORY_RULE_TYPES.SENDER_DOMAIN) {
      return domainHash !== null && rule.patternHash === domainHash;
    }
    if (rule.ruleType === CATEGORY_RULE_TYPES.SUBJECT_PREFIX) {
      return prefixHash !== null && rule.patternHash === prefixHash;
    }
    if (
      rule.ruleType ===
      CATEGORY_RULE_MATCH_MODES.SENDER_DOMAIN_AND_SUBJECT_PREFIX
    ) {
      if (!domainPattern || !subjectPrefix) {
        return false;
      }
      const combinedHashInput = `${domainPattern.toLowerCase()}|${subjectPrefix.toLowerCase()}`;
      const combinedHash = SearchIndexHelper.hashExact(combinedHashInput);
      return rule.patternHash === combinedHash;
    }
    return false;
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
