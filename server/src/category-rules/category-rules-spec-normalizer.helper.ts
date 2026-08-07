import { BadRequestException } from "@nestjs/common";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CompositeCategoryRuleSpecV3 } from "../database/entities/category-rule.entity";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";

/** The trimmed, normalised phrase arrays a composite spec is validated against. */
interface NormalisedCompositeFields {
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  subjectNotContainsAny: string[];
  bodyNotContainsAny: string[];
  /** True when the rule is pinned to a resolved notification sub-stream. */
  hasStructuralSubtype: boolean;
}

/**
 * Enforces the composite-rule field limits and the minimum-condition rule.
 * Structural rules (pinned to a resolved notification sub-stream) may omit
 * subject/body phrases — the subtype is itself a precise separator — and clear
 * the distinct-condition bar with sender + subtype; phrase-only rules still need
 * all three fields. Throws BadRequestException on the first violation.
 */
function assertCompositeSpecFieldsValid(
  fields: NormalisedCompositeFields,
): void {
  const {
    senderMatchesAny,
    subjectContainsAny,
    bodyContainsAny,
    subjectNotContainsAny,
    bodyNotContainsAny,
    hasStructuralSubtype,
  } = fields;
  const require = (condition: boolean, message: string): void => {
    if (condition) throw new BadRequestException(message);
  };

  require(senderMatchesAny.length ===
    0, "senderMatchesAny must contain at least one non-empty sender");
  require(senderMatchesAny.length >
    CATEGORY_RULE_COMPOSITE.MAX_SENDERS, `At most ${CATEGORY_RULE_COMPOSITE.MAX_SENDERS} senders allowed`);
  require(!hasStructuralSubtype &&
    subjectContainsAny.length ===
      0, "subjectContainsAny must contain at least one non-empty phrase");
  require(subjectContainsAny.length >
    CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES, `At most ${CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES} subject phrases allowed`);
  require(!hasStructuralSubtype &&
    bodyContainsAny.length ===
      0, "bodyContainsAny must contain at least one non-empty phrase");
  require(bodyContainsAny.length >
    CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASES, `At most ${CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASES} body phrases allowed`);
  require(subjectNotContainsAny.length >
    CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES, `At most ${CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES} subject not-contains phrases allowed`);
  require(bodyNotContainsAny.length >
    CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES, `At most ${CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES} body not-contains phrases allowed`);

  // A resolved notification subtype counts as a distinct structural condition:
  // sender + subtype is already a hard separator, so structural rules clear the
  // requirement with MIN_DISTINCT_CONDITION_TYPES_STRUCTURAL (2) rather than the
  // full 3-field bar that phrase-only rules must meet.
  const populatedFieldCount = [
    senderMatchesAny.length > 0,
    subjectContainsAny.length > 0,
    bodyContainsAny.length > 0,
    hasStructuralSubtype,
  ].filter(Boolean).length;
  const minDistinctConditions = hasStructuralSubtype
    ? CATEGORY_RULE_COMPOSITE.MIN_DISTINCT_CONDITION_TYPES_STRUCTURAL
    : CATEGORY_RULE_COMPOSITE.MIN_DISTINCT_CONDITION_TYPES;
  require(populatedFieldCount <
    minDistinctConditions, `Composite rules must include conditions for all ${CATEGORY_RULE_COMPOSITE.MIN_DISTINCT_CONDITION_TYPES} distinct fields: sender, subject, and body`);
}

/**
 * Normalises and validates a CreateCompositeCategoryRuleDto into a V3 spec.
 * Extracted from CategoryRulesService to keep the service within the line limit.
 */
export function normalizeCompositeSpec(
  dto: CreateCompositeCategoryRuleDto,
  normaliseSender: (raw: string) => string,
): CompositeCategoryRuleSpecV3 {
  const senderMatchesAny = (dto.fromMatchesAny ?? dto.senderMatchesAny)
    .map(normaliseSender)
    .filter(Boolean);
  const subjectContainsAny = dto.subjectContainsAny
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  const bodyContainsAny = dto.bodyContainsAny
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  const subjectNotContainsAny = (dto.subjectNotContainsAny ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  const bodyNotContainsAny = (dto.bodyNotContainsAny ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  const hasStructuralSubtype = Boolean(dto.notificationSubtype?.trim());

  assertCompositeSpecFieldsValid({
    senderMatchesAny,
    subjectContainsAny,
    bodyContainsAny,
    subjectNotContainsAny,
    bodyNotContainsAny,
    hasStructuralSubtype,
  });

  return {
    v: CATEGORY_RULE_COMPOSITE.SPEC_VERSION,
    fromMatchesAny: senderMatchesAny,
    subjectContainsAny,
    bodyContainsAny,
    ...(subjectNotContainsAny.length > 0 && { subjectNotContainsAny }),
    ...(bodyNotContainsAny.length > 0 && { bodyNotContainsAny }),
    ...(dto.emailIsRead !== undefined && { emailIsRead: dto.emailIsRead }),
    ...(dto.emailAttachment && { emailAttachment: dto.emailAttachment }),
    ...(dto.emailReceived && { emailReceived: dto.emailReceived }),
    ...(dto.emailRead && { emailRead: dto.emailRead }),
    ...(dto.notificationSubtype && {
      notificationSubtype: dto.notificationSubtype,
    }),
  };
}
