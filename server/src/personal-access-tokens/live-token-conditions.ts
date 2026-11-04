import { FindOptionsWhere, IsNull, MoreThan } from "typeorm";

import { ACCESS_TOKEN_KINDS } from "../constants/personal-access-tokens.constants";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";

/**
 * Where-clause (OR of the two branches) for a user's tokens that still count:
 * unrevoked personal tokens, and OAuth connections whose refresh token hasn't
 * lapsed. Lapsed OAuth rows are dead weight and are neither listed nor counted
 * towards the per-user cap.
 */
export function liveTokenConditions(
  userId: string,
  now: Date,
): FindOptionsWhere<PersonalAccessToken>[] {
  return [
    { userId, revokedAt: IsNull(), kind: ACCESS_TOKEN_KINDS.PERSONAL },
    {
      userId,
      revokedAt: IsNull(),
      kind: ACCESS_TOKEN_KINDS.OAUTH,
      refreshTokenExpiresAt: MoreThan(now),
    },
  ];
}
