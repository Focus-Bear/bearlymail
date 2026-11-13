import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "crypto";
import { Repository } from "typeorm";

import { CrmSenderMatch } from "../database/entities/crm-sender-match.entity";
import type { MCPServerConfig } from "../database/entities/mcp-server-config.entity";

const FINGERPRINT_ALGORITHM = "sha256";
const FINGERPRINT_ENCODING = "hex";
const FINGERPRINT_SEPARATOR = "\n";
const MATCH_CONFLICT_COLUMNS = ["userId", "serverId", "emailHash"];

export interface CrmSenderMatchKey {
  userId: string;
  serverId: string;
  emailHash: string;
}

export interface CrmRecordMatch {
  recordModule: string;
  recordId: string;
  displayName: string;
  matchCount: number;
}

/**
 * Identifies which CRM account a connection points at. Zoho issues a distinct
 * MCP URL per org, and the OAuth issuer pins the data centre, so a reconnect to
 * another org changes this value and orphans the old matches.
 */
export function connectionFingerprint(
  connection: Pick<MCPServerConfig, "serverUrl" | "oauthMetadata">,
): string {
  return createHash(FINGERPRINT_ALGORITHM)
    .update(
      [connection.serverUrl, connection.oauthMetadata?.issuer ?? ""].join(
        FINGERPRINT_SEPARATOR,
      ),
    )
    .digest(FINGERPRINT_ENCODING);
}

/** Persists which CRM record each sender resolved to, per user and connection. */
@Injectable()
export class CrmSenderMatchStore {
  constructor(
    @InjectRepository(CrmSenderMatch)
    private readonly repo: Repository<CrmSenderMatch>,
  ) {}

  /** The stored match or miss, ignoring one made on a different connection. */
  async find(
    key: CrmSenderMatchKey,
    fingerprint: string,
  ): Promise<CrmSenderMatch | null> {
    const match = await this.repo.findOne({ where: { ...key } });
    return match?.connectionFingerprint === fingerprint ? match : null;
  }

  async saveMatch(
    key: CrmSenderMatchKey,
    fingerprint: string,
    match: CrmRecordMatch,
  ): Promise<void> {
    await this.upsert(key, fingerprint, match);
  }

  async saveMiss(key: CrmSenderMatchKey, fingerprint: string): Promise<void> {
    await this.upsert(key, fingerprint, {
      recordModule: null,
      recordId: null,
      displayName: null,
      matchCount: 0,
    });
  }

  async forget(key: CrmSenderMatchKey): Promise<void> {
    await this.repo.delete({ ...key });
  }

  private async upsert(
    key: CrmSenderMatchKey,
    fingerprint: string,
    fields: Pick<
      CrmSenderMatch,
      "recordModule" | "recordId" | "displayName" | "matchCount"
    >,
  ): Promise<void> {
    // Atomic upsert: two opens of the same sender can resolve concurrently.
    await this.repo.upsert(
      {
        ...key,
        ...fields,
        connectionFingerprint: fingerprint,
        matchedAt: new Date(),
      },
      MATCH_CONFLICT_COLUMNS,
    );
  }
}
