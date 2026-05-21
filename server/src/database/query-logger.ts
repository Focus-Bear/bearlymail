import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { Logger as TypeOrmLogger, QueryRunner } from "typeorm";

import { LOG_LEVELS } from "../constants/domain-types";
import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "../utils/logs-dir";

const SLOW_QUERY_LOG_FILE = path.join(LOGS_DIR, "slow-queries.log");
const QUERY_SNIPPET_LENGTH = 500;

/**
 * Append a line to the slow-query log file.
 *
 * Dev-only and never-throwing — matching search-logger / auth-logger. Two
 * reasons this MUST be gated and swallowed (issue #2132):
 *  1. Production runs as `USER node` with a non-writeable `/app`, and the logs
 *     dir doesn't exist, so `appendFileSync` throws `ENOENT`.
 *  2. TypeORM calls `logQueryError` from *inside* query execution. If the
 *     logger throws, that error replaces the real `QueryFailedError` and
 *     propagates to the caller — which is exactly how the genuine
 *     "invalid input syntax for type json" failure got hidden behind a
 *     misleading `ENOENT: ... slow-queries.log`.
 * Console logging (via the NestJS Logger) still happens in production; only
 * the file write is dev-gated.
 */
function writeToLogFile(message: string) {
  if (!isDevelopment) return;
  try {
    ensureLogsDirSync();
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(SLOW_QUERY_LOG_FILE, logLine, "utf8");
  } catch {
    // Best-effort: a logging failure must never break a DB query.
  }
}

// Custom logger that only logs slow queries to console AND file
export class QueryPerformanceLogger implements TypeOrmLogger {
  private readonly logger = new Logger("QueryPerformance");
  private readonly slowQueryThreshold = parseInt(
    process.env.SLOW_QUERY_THRESHOLD_MS || "1000",
    10,
  );

  logQuery(
    _query: string,
    _parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ) {
    // Don't log every query - TypeORM will call logQuerySlow for slow ones
    // This method is called for all queries, but we don't want to log them all
  }

  logQueryError(
    error: string | Error,
    query: string,
    _parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ) {
    const errorMsg = error instanceof Error ? error.message : error;
    const querySnippet = query.substring(0, QUERY_SNIPPET_LENGTH);
    // Parameters are intentionally omitted — they contain encrypted ciphertext and must not appear in logs.
    const logMessage = `❌ Query Error: ${errorMsg}\nQuery: ${querySnippet}`;

    this.logger.error(logMessage);
    writeToLogFile(`ERROR - ${logMessage}`);
  }

  logQuerySlow(
    time: number,
    query: string,
    _parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ) {
    const querySnippet = query.substring(0, QUERY_SNIPPET_LENGTH);
    // Parameters are intentionally omitted — they contain encrypted ciphertext and must not appear in logs.
    const logMessage = `SLOW QUERY (${time}ms):\n${querySnippet}`;

    // Log to console
    this.logger.warn(`⚠️  ${logMessage}`);

    // Also write to file
    writeToLogFile(logMessage);
  }

  logSchemaBuild(_message: string, _queryRunner?: QueryRunner) {
    // Don't log schema builds
  }

  logMigration(message: string, _queryRunner?: QueryRunner) {
    // Only log migrations to file, not console
    writeToLogFile(`Migration: ${message}`);
  }

  log(
    level: "log" | "info" | "warn",
    message: unknown,
    _queryRunner?: QueryRunner,
  ) {
    // Only log warnings
    if (level === LOG_LEVELS.WARN) {
      this.logger.warn(message);
      writeToLogFile(`WARN: ${message}`);
    }
  }
}
