import { IsNull, Repository } from "typeorm";

import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";

/**
 * Ends every personal access token and OAuth connection a user has. Called
 * when their password changes: those credentials outlive the session JWTs the
 * password change already invalidates, so without this whoever had taken over
 * the account would keep reading and sending mail through `/mcp`.
 *
 * A plain function rather than a service method so the auth module can call
 * it without importing PersonalAccessTokensModule, which imports AuthModule.
 */
export async function revokeAllAccessTokens(
  tokenRepository: Repository<PersonalAccessToken>,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const result = await tokenRepository.update(
    { userId, revokedAt: IsNull() },
    { revokedAt: now },
  );
  return result.affected ?? 0;
}
