import { BadRequestException } from "@nestjs/common";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CompositeCategoryRuleSpecV3 } from "../database/entities/category-rule.entity";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";

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

  if (senderMatchesAny.length === 0) {
    throw new BadRequestException(
      "senderMatchesAny must contain at least one non-empty sender",
    );
  }
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
  if (subjectContainsAny.length > CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES) {
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
  if (
    subjectNotContainsAny.length >
    CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES
  ) {
    throw new BadRequestException(
      `At most ${CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES} subject not-contains phrases allowed`,
    );
  }
  if (
    bodyNotContainsAny.length > CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES
  ) {
    throw new BadRequestException(
      `At most ${CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES} body not-contains phrases allowed`,
    );
  }
  const populatedFieldCount = [
    senderMatchesAny.length > 0,
    subjectContainsAny.length > 0,
    bodyContainsAny.length > 0,
  ].filter(Boolean).length;
  if (
    populatedFieldCount < CATEGORY_RULE_COMPOSITE.MIN_DISTINCT_CONDITION_TYPES
  ) {
    throw new BadRequestException(
      `Composite rules must include conditions for all ${CATEGORY_RULE_COMPOSITE.MIN_DISTINCT_CONDITION_TYPES} distinct fields: sender, subject, and body`,
    );
  }
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
  };
}
