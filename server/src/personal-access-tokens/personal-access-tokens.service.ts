import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes } from "crypto";
import { IsNull, Repository } from "typeorm";

import {
  ALL_PAT_SCOPES,
  PatScope,
  PERSONAL_ACCESS_TOKENS,
} from "../constants/personal-access-tokens.constants";
import { MILLISECONDS } from "../constants/time-constants";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";

/** Who a valid token acts as, and what it may do. */
export interface PatPrincipal {
  userId: string;
  tokenId: string;
  scopes: PatScope[];
}

/** A token as listed in Settings: never includes the secret or its hash. */
export interface PersonalAccessTokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: PatScope[];
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

export function hashPersonalAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isPatScope(value: string): value is PatScope {
  return (ALL_PAT_SCOPES as readonly string[]).includes(value);
}

function toSummary(row: PersonalAccessToken): PersonalAccessTokenSummary {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes.filter(isPatScope),
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

/**
 * Issues, lists, revokes and authenticates personal access tokens — the
 * long-lived scoped credentials external clients (Claude over `/mcp`) use
 * instead of the 7-day browser session JWT.
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
    const activeCount = await this.tokenRepository.count({
      where: { userId, revokedAt: IsNull() },
    });
    if (activeCount >= PERSONAL_ACCESS_TOKENS.MAX_ACTIVE_TOKENS_PER_USER) {
      throw new BadRequestException(
        `You can have at most ${PERSONAL_ACCESS_TOKENS.MAX_ACTIVE_TOKENS_PER_USER} active tokens. Revoke one first.`,
      );
    }

    const token =
      PERSONAL_ACCESS_TOKENS.TOKEN_PREFIX +
      randomBytes(PERSONAL_ACCESS_TOKENS.TOKEN_RANDOM_BYTES).toString(
        "base64url",
      );
    const expiresAt = input.expiresInDays
      ? new Date(now.getTime() + input.expiresInDays * MILLISECONDS.DAY)
      : null;

    const saved = await this.tokenRepository.save(
      this.tokenRepository.create({
        userId,
        name,
        tokenHash: hashPersonalAccessToken(token),
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

  async list(userId: string): Promise<PersonalAccessTokenSummary[]> {
    const rows = await this.tokenRepository.find({
      where: { userId, revokedAt: IsNull() },
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
   * Resolves a raw bearer string to the principal it acts as, or null when it
   * is not a live token (wrong format, unknown, revoked or expired).
   */
  async authenticate(
    rawToken: string,
    now: Date = new Date(),
  ): Promise<PatPrincipal | null> {
    if (!rawToken.startsWith(PERSONAL_ACCESS_TOKENS.TOKEN_PREFIX)) {
      return null;
    }
    const row = await this.tokenRepository.findOne({
      where: {
        tokenHash: hashPersonalAccessToken(rawToken),
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
