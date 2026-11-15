import { BadRequestException, NotFoundException } from "@nestjs/common";

import { isUuid } from "../common/uuid.utils";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { STAR_COUNTS } from "../constants/priority-constants";

const MIN_STATS_DAYS = 1;

/**
 * Email ids are UUIDs. Anything else cannot match a row and would otherwise
 * reach PostgreSQL as a uuid cast error, i.e. a 500.
 */
export function assertEmailId(id: string): void {
  if (!isUuid(id)) {
    throw new NotFoundException(ERROR_MESSAGES.EMAIL_NOT_FOUND);
  }
}

export function assertValidStarCount(
  starCount: unknown,
): asserts starCount is number {
  const isInRange =
    typeof starCount === "number" &&
    Number.isInteger(starCount) &&
    starCount >= STAR_COUNTS.MIN &&
    starCount <= STAR_COUNTS.MAX;
  if (!isInRange) {
    throw new BadRequestException(
      `starCount must be a whole number from ${STAR_COUNTS.MIN} to ${STAR_COUNTS.MAX}`,
    );
  }
}

export function parseStatsDays(daysParam: string): number {
  const days = Number(daysParam);
  if (!Number.isInteger(days) || days < MIN_STATS_DAYS) {
    throw new BadRequestException("days must be a positive whole number");
  }
  return days;
}
