import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, IsNull, Repository } from "typeorm";

import { MCP_OAUTH } from "../constants/mcp-oauth.constants";
import {
  ACCESS_TOKEN_KINDS,
  PatScope,
  PERSONAL_ACCESS_TOKENS,
} from "../constants/personal-access-tokens.constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";
import {
  isPatScope,
  PersonalAccessTokensService,
} from "./personal-access-tokens.service";
import { generateTokenSecret, hashTokenSecret } from "./token-secrets";

/** What the token endpoint hands back to an OAuth client. */
export interface OAuthTokenSet {
  tokenId: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scopes: PatScope[];
}

export interface IssueOAuthGrantInput {
  userId: string;
  clientId: string;
  /** Shown in Settings, e.g. "Claude (claude.ai)". */
  name: string;
  scopes: PatScope[];
}

type SecretColumns = Pick<
  PersonalAccessToken,
  | "tokenHash"
  | "tokenPrefix"
  | "expiresAt"
  | "refreshTokenHash"
  | "refreshTokenExpiresAt"
>;

interface FreshSecrets {
  accessToken: string;
  refreshToken: string;
  columns: SecretColumns;
}

function generateSecrets(now: Date): FreshSecrets {
  const accessToken = generateTokenSecret(MCP_OAUTH.ACCESS_TOKEN_PREFIX);
  const refreshToken = generateTokenSecret(MCP_OAUTH.REFRESH_TOKEN_PREFIX);
  return {
    accessToken,
    refreshToken,
    columns: {
      tokenHash: hashTokenSecret(accessToken),
      tokenPrefix: accessToken.slice(
        0,
        PERSONAL_ACCESS_TOKENS.DISPLAY_PREFIX_LENGTH,
      ),
      expiresAt: new Date(
        now.getTime() + MCP_OAUTH.ACCESS_TOKEN_TTL_SECONDS * MS_PER_SECOND,
      ),
      refreshTokenHash: hashTokenSecret(refreshToken),
      refreshTokenExpiresAt: new Date(
        now.getTime() + MCP_OAUTH.REFRESH_TOKEN_TTL_MS,
      ),
    },
  };
}

function toTokenSet(
  tokenId: string,
  secrets: FreshSecrets,
  scopes: PatScope[],
): OAuthTokenSet {
  return {
    tokenId,
    accessToken: secrets.accessToken,
    refreshToken: secrets.refreshToken,
    expiresInSeconds: MCP_OAUTH.ACCESS_TOKEN_TTL_SECONDS,
    scopes,
  };
}

/**
 * OAuth connections, stored as `personal_access_tokens` rows (kind 'oauth') so
 * they resolve to the same principal and show up — and revoke — alongside
 * personal tokens in Settings. Access tokens are short-lived; every refresh
 * rotates both secrets in place, so a refresh token works exactly once.
 */
@Injectable()
export class OAuthGrantsService {
  constructor(
    @InjectRepository(PersonalAccessToken)
    private readonly tokenRepository: Repository<PersonalAccessToken>,
    private readonly tokensService: PersonalAccessTokensService,
  ) {}

  async issue(
    input: IssueOAuthGrantInput,
    now: Date = new Date(),
  ): Promise<OAuthTokenSet> {
    await this.tokensService.assertBelowTokenLimit(input.userId, now);
    const secrets = generateSecrets(now);
    const scopes = [...new Set(input.scopes)];
    const saved = await this.tokenRepository.save(
      this.tokenRepository.create({
        userId: input.userId,
        kind: ACCESS_TOKEN_KINDS.OAUTH,
        name: input.name,
        oauthClientId: input.clientId,
        scopes,
        lastUsedAt: null,
        revokedAt: null,
        ...secrets.columns,
      }),
    );
    return toTokenSet(saved.id, secrets, scopes);
  }

  /**
   * Exchanges a refresh token for a new access + refresh token pair, or null
   * when it is not a live refresh token issued to this client (the token
   * endpoint answers `invalid_grant`).
   */
  async refresh(
    refreshToken: string,
    clientId: string,
    now: Date = new Date(),
  ): Promise<OAuthTokenSet | null> {
    if (!refreshToken.startsWith(MCP_OAUTH.REFRESH_TOKEN_PREFIX)) return null;
    const previousHash = hashTokenSecret(refreshToken);
    const row = await this.tokenRepository.findOne({
      where: {
        refreshTokenHash: previousHash,
        kind: ACCESS_TOKEN_KINDS.OAUTH,
        revokedAt: IsNull(),
      },
    });
    const isLive =
      row?.oauthClientId === clientId &&
      !!row.refreshTokenExpiresAt &&
      row.refreshTokenExpiresAt.getTime() > now.getTime();
    if (!row || !isLive) return null;

    const secrets = generateSecrets(now);
    // Conditional on the old hash, so two concurrent refreshes with the same
    // token can't both succeed.
    const result = await this.tokenRepository.update(
      { id: row.id, refreshTokenHash: previousHash, revokedAt: IsNull() },
      secrets.columns,
    );
    if (!result.affected) return null;
    return toTokenSet(row.id, secrets, row.scopes.filter(isPatScope));
  }

  /**
   * RFC 7009 revocation by access or refresh token. Either ends the whole
   * connection. Unknown tokens are ignored: the endpoint always answers 200.
   */
  async revokeBySecret(
    rawToken: string,
    clientId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const secretMatch = this.whereSecret(rawToken);
    if (!secretMatch) return;
    await this.tokenRepository.update(
      {
        ...secretMatch,
        kind: ACCESS_TOKEN_KINDS.OAUTH,
        oauthClientId: clientId,
        revokedAt: IsNull(),
      },
      { revokedAt: now },
    );
  }

  /** Ends a connection outright, e.g. when its authorization code is replayed. */
  async revokeById(tokenId: string, now: Date = new Date()): Promise<void> {
    await this.tokenRepository.update(
      { id: tokenId, kind: ACCESS_TOKEN_KINDS.OAUTH, revokedAt: IsNull() },
      { revokedAt: now },
    );
  }

  private whereSecret(
    rawToken: string,
  ): FindOptionsWhere<PersonalAccessToken> | null {
    const hash = hashTokenSecret(rawToken);
    if (rawToken.startsWith(MCP_OAUTH.REFRESH_TOKEN_PREFIX)) {
      return { refreshTokenHash: hash };
    }
    if (rawToken.startsWith(MCP_OAUTH.ACCESS_TOKEN_PREFIX)) {
      return { tokenHash: hash };
    }
    return null;
  }
}
