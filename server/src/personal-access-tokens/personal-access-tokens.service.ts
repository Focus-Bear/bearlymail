import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { MCP_OAUTH } from "../constants/mcp-oauth.constants";
import {
  ACCESS_TOKEN_KINDS,
  AccessTokenKind,
  ALL_PAT_SCOPES,
  PatScope,
  PERSONAL_ACCESS_TOKENS,
} from "../constants/personal-access-tokens.constants";
import { MILLISECONDS } from "../constants/time-constants";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";
import { liveTokenConditions } from "./live-token-conditions";
import { generateTokenSecret, hashTokenSecret } from "./token-secrets";

/** Who a valid token acts as, and what it may do. */
export interface PatPrincipal {
  userId: string;
  tokenId: string;
  scopes: PatScope[];
}

/** A token as listed in Settings: never includes the secret or its hash. */
export interface PersonalAccessTokenSummary {
  id: string;
  kind: AccessTokenKind;
  name: string;
  tokenPrefix: string;
  scopes: PatScope[];
  /** For an OAuth connection: when it lapses unless the client refreshes. */
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface CreatePersonalAccessTokenInput {
  name: string;
  scopes: PatScope[];
  expiresInDays?: number | null;
}

export interface CreatedPersonalAccessToken {
  /** The plaintext token. Returned once; only its hash is stored. */
  token: string;
  summary: PersonalAccessTokenSummary;
}

/** Bearer prefixes that resolve through `authenticate` (never refresh tokens). */
const AUTHENTICATABLE_PREFIXES: readonly string[] = [
  PERSONAL_ACCESS_TOKENS.TOKEN_PREFIX,
  MCP_OAUTH.ACCESS_TOKEN_PREFIX,
];

/** True for strings shaped like a personal or OAuth access token. */
export function hasBearlyMailTokenPrefix(token: string): boolean {
  return AUTHENTICATABLE_PREFIXES.some((prefix) => token.startsWith(prefix));
}

export function isPatScope(value: string): value is PatScope {
  return (ALL_PAT_SCOPES as readonly string[]).includes(value);
}

function toSummary(row: PersonalAccessToken): PersonalAccessTokenSummary {
  const isOAuth = row.kind === ACCESS_TOKEN_KINDS.OAUTH;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes.filter(isPatScope),
    expiresAt: isOAuth ? row.refreshTokenExpiresAt : row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

/**
 * Issues, lists, revokes and authenticates personal access tokens — the
 * scoped credentials external clients (Claude over `/mcp`) use instead of the
 * 7-day browser session JWT. OAuth connections share the table and are issued
 * by OAuthGrantsService; list, revoke and authenticate cover both kinds.
 */
@Injectable()
export class PersonalAccessTokensService {
  private readonly logger = new Logger(PersonalAccessTokensService.name);

  constructor(
    @InjectRepository(PersonalAccessToken)
    private readonly tokenRepository: Repository<PersonalAccessToken>,
  ) {}

  async create(
    userId: string,
    input: CreatePersonalAccessTokenInput,
    now: Date = new Date(),
  ): Promise<CreatedPersonalAccessToken> {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException("Token name is required");
    }
    await this.assertBelowTokenLimit(userId, now);

    const token = generateTokenSecret(PERSONAL_ACCESS_TOKENS.TOKEN_PREFIX);
    const expiresAt = input.expiresInDays
      ? new Date(now.getTime() + input.expiresInDays * MILLISECONDS.DAY)
      : null;

    const saved = await this.tokenRepository.save(
      this.tokenRepository.create({
        userId,
        kind: ACCESS_TOKEN_KINDS.PERSONAL,
        name,
        tokenHash: hashTokenSecret(token),
        tokenPrefix: token.slice(
          0,
          PERSONAL_ACCESS_TOKENS.DISPLAY_PREFIX_LENGTH,
        ),
        scopes: [...new Set(input.scopes)],
        expiresAt,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    return { token, summary: toSummary(saved) };
  }

  /**
   * Throws when the user already has the maximum number of live tokens and
   * connections, so a new one can't be added until they revoke one.
   */
  async assertBelowTokenLimit(userId: string, now: Date): Promise<void> {
    const activeCount = await this.tokenRepository.count({
      where: liveTokenConditions(userId, now),
    });
    if (activeCount >= PERSONAL_ACCESS_TOKENS.MAX_ACTIVE_TOKENS_PER_USER) {
      throw new BadRequestException(
        `You can have at most ${PERSONAL_ACCESS_TOKENS.MAX_ACTIVE_TOKENS_PER_USER} active tokens and connections. Revoke one first.`,
      );
    }
  }

  async list(
    userId: string,
    now: Date = new Date(),
  ): Promise<PersonalAccessTokenSummary[]> {
    const rows = await this.tokenRepository.find({
      where: liveTokenConditions(userId, now),
      order: { createdAt: "DESC" },
    });
    return rows.map(toSummary);
  }

  async revoke(
    userId: string,
    tokenId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const result = await this.tokenRepository.update(
      { id: tokenId, userId, revokedAt: IsNull() },
      { revokedAt: now },
    );
    if (!result.affected) {
      throw new NotFoundException("Token not found");
    }
  }

  /**
   * Resolves a raw bearer string (a personal token or an OAuth access token)
   * to the principal it acts as, or null when it is not a live token (wrong
   * format, unknown, revoked or expired).
   */
  async authenticate(
    rawToken: string,
    now: Date = new Date(),
  ): Promise<PatPrincipal | null> {
    if (!hasBearlyMailTokenPrefix(rawToken)) return null;
    const row = await this.tokenRepository.findOne({
      where: {
        tokenHash: hashTokenSecret(rawToken),
        revokedAt: IsNull(),
      },
    });
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
      return null;
    }
    this.touchLastUsed(row, now);
    return {
      userId: row.userId,
      tokenId: row.id,
      scopes: row.scopes.filter(isPatScope),
    };
  }

  private touchLastUsed(row: PersonalAccessToken, now: Date): void {
    const isStale =
      !row.lastUsedAt ||
      now.getTime() - row.lastUsedAt.getTime() >
        PERSONAL_ACCESS_TOKENS.LAST_USED_WRITE_INTERVAL_MS;
    if (!isStale) return;
    this.tokenRepository
      .update({ id: row.id }, { lastUsedAt: now })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to update lastUsedAt for token ${row.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }
}
