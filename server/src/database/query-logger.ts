import { Logger } from "@nestjs/common";
import { Logger as TypeOrmLogger } from "typeorm";
import * as fs from "fs";
import * as path from "path";

// Ensure logs directory exists
const LOGS_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const SLOW_QUERY_LOG_FILE = path.join(LOGS_DIR, "slow-queries.log");

// Helper to write to log file
function writeToLogFile(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(SLOW_QUERY_LOG_FILE, logLine, "utf8");
}

// Custom logger that only logs slow queries to console AND file
export class QueryPerformanceLogger implements TypeOrmLogger {
  private readonly logger = new Logger("QueryPerformance");
  private readonly slowQueryThreshold = parseInt(
    process.env.SLOW_QUERY_THRESHOLD_MS || "1000",
    10,
  );

  logQuery(query: string, parameters?: any[], queryRunner?: any) {
    // Don't log every query - TypeORM will call logQuerySlow for slow ones
    // This method is called for all queries, but we don't want to log them all
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: any[],
    queryRunner?: any,
  ) {
    const errorMsg = error instanceof Error ? error.message : error;
    const querySnippet = query.substring(0, 500);
    const logMessage = `❌ Query Error: ${errorMsg}\nQuery: ${querySnippet}${parameters && parameters.length > 0 ? `\nParameters: ${JSON.stringify(parameters)}` : ""}`;

    this.logger.error(logMessage);
    writeToLogFile(`ERROR - ${logMessage}`);
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: any[],
    queryRunner?: any,
  ) {
    const querySnippet = query.substring(0, 500);
    const paramsStr =
      parameters && parameters.length > 0
        ? `\nParameters: ${JSON.stringify(parameters)}`
        : "";
    const logMessage = `SLOW QUERY (${time}ms):\n${querySnippet}${paramsStr}`;

    // Log to console
    this.logger.warn(`⚠️  ${logMessage}`);

    // Also write to file
    writeToLogFile(logMessage);
  }

  logSchemaBuild(message: string, queryRunner?: any) {
    // Don't log schema builds
  }

  logMigration(message: string, queryRunner?: any) {
    // Only log migrations to file, not console
    writeToLogFile(`Migration: ${message}`);
  }

  log(level: "log" | "info" | "warn", message: any, queryRunner?: any) {
    // Only log warnings
    if (level === "warn") {
      this.logger.warn(message);
      writeToLogFile(`WARN: ${message}`);
    }
  }
}
