import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "./logs-dir";

ensureLogsDirSync();

const SEARCH_LOG_FILE = path.join(LOGS_DIR, "search-system.log");

// Helper to write to log file
function writeToLogFile(message: string) {
  if (!isDevelopment) return;
  try {
    ensureLogsDirSync();
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(SEARCH_LOG_FILE, logLine, "utf8");
  } catch {
    // Best-effort: never let a logging failure break the search request
  }
}

export interface EmailScoreDetails {
  userId: string;
  originalQuery: string;
  emailIndex: number;
  from: string;
  subject: string;
  baseScore: number;
  recencyAdjustment: number;
  finalScore: number;
  included: boolean;
  rejectionReason?: string;
}

/**
 * Dedicated logger for search operations
 * Writes all search-related logs to logs/search-system.log
 */
export class SearchLogger {
  private readonly logger = new Logger("SearchSystem");

  /**
   * Log search operation start
   */
  logSearchStart(userId: string, originalQuery: string) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Starting search`;
    this.logger.log(message);
    writeToLogFile(message);
  }

  /**
   * Log query variations generated
   */
  logQueryVariations(
    userId: string,
    originalQuery: string,
    variations: string[],
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Variations: ${JSON.stringify(variations)}`;
    this.logger.log(message);
    writeToLogFile(message);
  }

  /**
   * Log Gmail queries that will be tried
   */
  logGmailQueries(
    userId: string,
    originalQuery: string,
    gmailQueries: string[],
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Will try ${gmailQueries.length} Gmail queries: ${JSON.stringify(gmailQueries)}`;
    this.logger.log(message);
    writeToLogFile(message);
  }

  /**
   * Log attempt to execute a Gmail query
   */
  logGmailQueryAttempt(
    userId: string,
    originalQuery: string,
    gmailQuery: string,
    queryIndex: number,
    totalQueries: number,
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Trying Gmail query: "${gmailQuery}" | Query index: ${queryIndex}/${totalQueries}`;
    this.logger.log(message);
    writeToLogFile(message);
  }

  /**
   * Log Gmail query result
   */
  logGmailQueryResult(
    userId: string,
    originalQuery: string,
    gmailQuery: string,
    resultCount: number,
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Gmail query "${gmailQuery}" returned ${resultCount} results`;
    this.logger.log(message);
    writeToLogFile(message);
  }

  /**
   * Log Gmail query error
   * @param error - The error object (can be any type since errors can come from various sources)
   */
  logGmailQueryError(
    userId: string,
    originalQuery: string,
    gmailQuery: string,
    error: unknown,
  ) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Gmail query "${gmailQuery}" failed: ${errorMsg}`;
    this.logger.warn(message);
    writeToLogFile(`ERROR - ${message}`);
  }

  /**
   * Log no results found
   */
  logNoResults(
    userId: string,
    originalQuery: string,
    queriesTried: Array<{ query: string; resultCount: number }>,
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | No results found. Queries tried: ${queriesTried.length}`;
    this.logger.log(message);
    writeToLogFile(message);

    if (queriesTried.length > 0) {
      queriesTried.forEach((query, i) => {
        const detailMessage = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Query ${i + 1}: "${query.query}" -> ${query.resultCount} results`;
        this.logger.log(detailMessage);
        writeToLogFile(detailMessage);
      });
    } else {
      const warningMessage = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | WARNING: No queries were attempted!`;
      this.logger.warn(warningMessage);
      writeToLogFile(`WARN - ${warningMessage}`);
    }
  }

  /**
   * Log thread deduplication
   */
  logThreadDeduplication(
    userId: string,
    originalQuery: string,
    beforeCount: number,
    afterCount: number,
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Thread deduplication: ${beforeCount} -> ${afterCount} unique threads`;
    this.logger.debug(message);
    writeToLogFile(message);
  }

  /**
   * Log start of AI scoring phase
   */
  logAIScoringStart(userId: string, originalQuery: string, emailCount: number) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Scoring ${emailCount} emails with AI...`;
    this.logger.log(message);
    writeToLogFile(message);
  }

  /**
   * Log individual email score
   */
  logEmailScore(details: EmailScoreDetails) {
    const {
      userId,
      originalQuery,
      emailIndex,
      from,
      subject,
      baseScore,
      recencyAdjustment,
      finalScore,
      included,
      rejectionReason,
    } = details;
    const status = included ? "Included" : "Rejected";
    const reason = rejectionReason ? ` | Reason: ${rejectionReason}` : "";
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Email ${emailIndex} (${from}: "${subject}"): baseScore=${baseScore}, recencyAdj=${recencyAdjustment >= 0 ? "+" : ""}${recencyAdjustment}, finalScore=${finalScore} | ${status}${reason}`;
    this.logger.debug(message);
    writeToLogFile(message);
  }

  /**
   * Log AI scoring completion
   */
  logAIScoringComplete(
    userId: string,
    originalQuery: string,
    totalEmails: number,
    includedCount: number,
    rejectedCount: number,
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | AI scoring complete: ${totalEmails} total, ${includedCount} included, ${rejectedCount} rejected`;
    this.logger.log(message);
    writeToLogFile(message);
  }

  /**
   * Log AI scoring error
   * @param error - The error object (can be any type since errors can come from various sources)
   */
  logAIScoringError(userId: string, originalQuery: string, error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | AI scoring failed: ${errorMsg}`;
    this.logger.error(message);
    writeToLogFile(`ERROR - ${message}`);
  }

  /**
   * Log search completion
   */
  logSearchComplete(
    userId: string,
    originalQuery: string,
    resultCount: number,
    totalTimeMs: number,
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Search complete: ${resultCount} results in ${totalTimeMs}ms`;
    this.logger.log(message);
    writeToLogFile(message);
  }

  /**
   * Log search error
   * @param error - The error object (can be any type since errors can come from various sources)
   */
  logSearchError(userId: string, originalQuery: string, error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Search error: ${errorMsg}${stack ? `\nStack: ${stack}` : ""}`;
    this.logger.error(message);
    writeToLogFile(`ERROR - ${message}`);
  }

  /**
   * Log performance metric
   */
  logPerformance(
    userId: string,
    originalQuery: string,
    step: string,
    durationMs: number,
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | Performance: ${step} took ${durationMs}ms`;
    this.logger.debug(message);
    writeToLogFile(message);
  }

  /**
   * Log structured data (for complex objects)
   */
  logStructured(
    userId: string,
    originalQuery: string,
    event: string,
    logData: unknown,
  ) {
    const message = `[SEARCH] User: ${userId} | Query: "${originalQuery}" | ${event}: ${JSON.stringify(logData)}`;
    this.logger.debug(message);
    writeToLogFile(message);
  }
}

// Export singleton instance
export const searchLogger = new SearchLogger();
