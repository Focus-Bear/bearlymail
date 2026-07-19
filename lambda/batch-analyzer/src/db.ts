/**
 * RDS connection management for the Lambda function.
 *
 * Uses pg directly (not TypeORM) to keep the Lambda bundle lean and
 * allow connection reuse across warm invocations.
 *
 * Connects via RDS Proxy to multiplex up to 30 concurrent Lambda invocations
 * through a small pool of actual DB connections (avoiding connection exhaustion
 * on t4g.micro with 112 max_connections).
 *
 * `context_analyses.stats` is encrypted at rest (TypeORM `encryptedJsonTransformer`
 * in the main app). Updates must decrypt → merge → encrypt; raw `jsonb_set` is invalid.
 */
import { Client } from "pg";

import { encryptStatsForDb, parseStatsFromDb } from "./encryption";
import { getDbSecrets } from "./secrets";
import { resolveUserKey } from "./user-key";

let pgClient: Client | null = null;
/**
 * Owned connection flag — tracks whether pgClient.connect() succeeded.
 * We never read pg's internal `_connected` property (private/undocumented).
 */
let isConnected = false;

const MAX_CONNECT_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTransaction<T>(
  db: Client,
  work: () => Promise<T>,
): Promise<T> {
  await db.query("BEGIN");
  try {
    const out = await work();
    await db.query("COMMIT");
    return out;
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

export async function getDbClient(): Promise<Client> {
  if (pgClient && isConnected) {
    return pgClient;
  }

  const secrets = await getDbSecrets();

  // RDS Proxy endpoint is passed via env var; falls back to direct RDS host
  const host = process.env.RDS_PROXY_ENDPOINT || secrets.host;

  pgClient = new Client({
    host,
    port: secrets.port,
    user: secrets.username,
    password: secrets.password,
    database: secrets.database,
    // TODO(security): rejectUnauthorized is false to allow RDS Proxy connections in dev/staging.
    // Follow-up issue: https://github.com/Focus-Bear/BearlyMail/issues/1447
    // Production fix: bundle AWS RDS global-bundle.pem and set rejectUnauthorized: true with ca.
    ssl: { rejectUnauthorized: false }, // nosemgrep
    // Increased to 10 s — RDS Proxy cold-start can take several seconds
    connectionTimeoutMillis: 10_000,
    // Do not set statement_timeout here: RDS Proxy returns FATAL
    // "Feature not supported: RDS Proxy currently doesn't support the option statement_timeout."
    // Rely on the Lambda function timeout and keep queries bounded in application code.
  });

  isConnected = false;

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      await pgClient.connect();
      isConnected = true;
      return pgClient;
    } catch (err) {
      const isLast = attempt === MAX_CONNECT_ATTEMPTS;
      console.error( // nosemgrep
        `[db] connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed:`,
        err,
      );
      if (isLast) {
        pgClient = null;
        isConnected = false;
        throw err;
      }
      await sleep(CONNECT_RETRY_DELAY_MS * attempt);
    }
  }

  // Unreachable — for TypeScript exhaustiveness
  throw new Error("getDbClient: exhausted retry loop");
}

function getBatchResultsMap(stats: Record<string, unknown>): Record<string, unknown> {
  const br = stats.batchResults;
  if (br && typeof br === "object" && !Array.isArray(br)) {
    return { ...(br as Record<string, unknown>) };
  }
  return {};
}

/**
 * Update a batch result in the context_analyses record's stats JSONB column.
 * Uses row lock + decrypt/encrypt so data matches TypeORM encryption on the server.
 */
export async function saveBatchResult(
  userId: string,
  analysisRecordId: string,
  batchIndex: number,
  result: {
    context: unknown[];
    writingStyle: unknown | null;
    completedAt: string;
    threadIds: string[];
  },
  batchSize: number,
): Promise<void> {
  const db = await getDbClient();
  // `stats` is per-user encrypted after the KMS migration — resolve the user's
  // data key (not the global key), or this decrypt/encrypt silently fails (#2082).
  const derivedKey = await resolveUserKey(db, userId);

  await withTransaction(db, async () => {
    const { rows } = await db.query<{ stats: unknown }>(
      `SELECT stats FROM context_analyses WHERE id = $1 FOR UPDATE`,
      [analysisRecordId],
    );
    if (rows.length === 0) {
      throw new Error(`context_analyses row not found: ${analysisRecordId}`);
    }

    const stats = parseStatsFromDb(rows[0].stats, derivedKey);
    const key = String(batchIndex);
    const batchResults = getBatchResultsMap(stats);

    if (batchResults[key] != null) {
      return;
    }

    batchResults[key] = result;
    const nextStats = { ...stats, batchResults };
    const encrypted = encryptStatsForDb(nextStats, derivedKey);

    await db.query(
      `
      UPDATE context_analyses
      SET
        stats = to_jsonb($2::text),
        "analyzedCount" = COALESCE("analyzedCount", 0) + $3,
        "updatedAt" = NOW()
      WHERE id = $1
      `,
      [analysisRecordId, encrypted, batchSize],
    );
  });
}

/**
 * Mark a batch as failed in the context_analyses record.
 *
 * Idempotency: if this batch index already has an entry in stats.batchResults, no-op.
 */
export async function saveBatchFailure(
  userId: string,
  analysisRecordId: string,
  batchIndex: number,
  error: {
    error: string;
    failedAt: string;
    errorType: string;
    correlationId: string;
  },
): Promise<void> {
  const db = await getDbClient();
  const derivedKey = await resolveUserKey(db, userId);

  await withTransaction(db, async () => {
    const { rows } = await db.query<{ stats: unknown }>(
      `SELECT stats FROM context_analyses WHERE id = $1 FOR UPDATE`,
      [analysisRecordId],
    );
    if (rows.length === 0) {
      throw new Error(`context_analyses row not found: ${analysisRecordId}`);
    }

    const stats = parseStatsFromDb(rows[0].stats, derivedKey);
    const key = String(batchIndex);
    const batchResults = getBatchResultsMap(stats);

    if (batchResults[key] != null) {
      return;
    }

    batchResults[key] = error;
    const nextStats = { ...stats, batchResults };
    const encrypted = encryptStatsForDb(nextStats, derivedKey);

    await db.query(
      `
      UPDATE context_analyses
      SET
        stats = to_jsonb($2::text),
        "updatedAt" = NOW()
      WHERE id = $1
      `,
      [analysisRecordId, encrypted],
    );
  });
}
