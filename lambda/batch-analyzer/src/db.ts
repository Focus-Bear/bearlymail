/**
 * RDS connection management for the Lambda function.
 *
 * Uses pg directly (not TypeORM) to keep the Lambda bundle lean and
 * allow connection reuse across warm invocations.
 *
 * Connects via RDS Proxy to multiplex up to 30 concurrent Lambda invocations
 * through a small pool of actual DB connections (avoiding connection exhaustion
 * on t4g.micro with 112 max_connections).
 */
import { Client } from "pg";
import { getDbSecrets } from "./secrets";

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
    ssl: { rejectUnauthorized: false },
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
      console.error(
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

/**
 * Update a batch result in the context_analysis record's stats JSONB column.
 * Uses a merge strategy to avoid clobbering concurrent writes from other Lambdas.
 */
export async function saveBatchResult(
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

  await db.query(
    `
    UPDATE context_analysis
    SET
      stats = jsonb_set(
        COALESCE(stats, '{}'),
        '{batchResults,' || $2::text || '}',
        $3::jsonb,
        true
      ),
      "analyzedCount" = COALESCE("analyzedCount", 0) + CASE
        WHEN (stats->'batchResults'->>$2::text) IS NULL THEN $4
        ELSE 0
      END,
      "updatedAt" = NOW()
    WHERE id = $1
      AND (stats->'batchResults'->>$2::text) IS NULL
    `,
    [analysisRecordId, batchIndex, JSON.stringify(result), batchSize],
  );
}

/**
 * Mark a batch as failed in the context_analysis record.
 *
 * Idempotency guard: the WHERE clause only matches when no result has been
 * written for this batch index yet. This mirrors saveBatchResult so that the
 * first write (success or failure) is permanent and a Lambda retry cannot
 * overwrite a prior success with a failure record.
 */
export async function saveBatchFailure(
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

  await db.query(
    `
    UPDATE context_analysis
    SET
      stats = jsonb_set(
        COALESCE(stats, '{}'),
        '{batchResults,' || $2::text || '}',
        $3::jsonb,
        true
      ),
      "updatedAt" = NOW()
    WHERE id = $1
      AND (stats->'batchResults'->>$2::text) IS NULL
    `,
    [analysisRecordId, batchIndex, JSON.stringify(error)],
  );
}
