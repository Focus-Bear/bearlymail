import { Logger } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

/**
 * When the worker boots in cluster mode, N forked processes all call
 * `boss.start()` concurrently. On a fresh schema, pg-boss v10's internal
 * `Contractor.start()` runs DDL (CREATE TABLE / ALTER / INSERT into
 * pgboss.version) inside its own transaction, and concurrent DDL on the same
 * objects produces a Postgres `40P01 deadlock detected` for the losing
 * transactions. Postgres aborts the loser; the next attempt succeeds because
 * the winning transaction's DDL is already committed and pg-boss's migration
 * is idempotent.
 *
 * Retrying in-process is dramatically better than the previous behaviour
 * (process dies → cluster master respawns it ~5s later) and matches the
 * standard "deadlock-then-retry" Postgres pattern.
 */

const POSTGRES_DEADLOCK_CODE = "40P01";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;
const RETRY_JITTER_MS = 200;

function isDeadlockError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "string") {
    return /deadlock detected/i.test(err);
  }
  if (typeof err === "object") {
    const { code, message } = err as { code?: string; message?: string };
    if (code === POSTGRES_DEADLOCK_CODE) return true;
    return typeof message === "string" && /deadlock detected/i.test(message);
  }
  return false;
}

export async function startBossWithDeadlockRetry(
  boss: PgBoss,
  logger: Logger,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await boss.start();
      return;
    } catch (err) {
      if (!isDeadlockError(err) || attempt === MAX_ATTEMPTS) throw err;
      const delay = RETRY_BASE_DELAY_MS + Math.random() * RETRY_JITTER_MS;
      logger.warn(
        `PgBoss start hit a schema-init deadlock (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${Math.round(delay)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
