import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const AUTORESPONDER_LOG_FILE = path.join(LOGS_DIR, "autoresponder.log");

function writeToAutoresponderLog(message: string): void {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(AUTORESPONDER_LOG_FILE, logLine, "utf8");
  } catch (error) {
    console.error("Failed to write to autoresponder log file:", error);
  }
}

export interface AutoresponderDecisionContext {
  userId: string;
  emailThreadId: string;
  senderEmail?: string;
  subject?: string;
}

export interface AutoresponderDecision {
  decision: "SEND" | "SKIP";
  reason: string;
  details?: Record<string, unknown>;
}

export class AutoresponderLogger {
  private readonly logger = new Logger("AutoresponderLogger");

  logDecision(
    context: AutoresponderDecisionContext,
    decision: AutoresponderDecision,
  ): void {
    const logEntry = {
      type: "DECISION",
      ...context,
      decision: decision.decision,
      reason: decision.reason,
      details: decision.details,
      timestamp: new Date().toISOString(),
    };

    const logMessage = `[DECISION] ${decision.decision} - ${decision.reason} | userId=${context.userId} threadId=${context.emailThreadId}${context.senderEmail ? ` sender=${context.senderEmail}` : ""}${context.subject ? ` subject="${context.subject}"` : ""}`;

    if (decision.decision === "SEND") {
      this.logger.log(logMessage);
    } else {
      this.logger.debug(logMessage);
    }

    writeToAutoresponderLog(
      `${logMessage}\n  Details: ${JSON.stringify(logEntry, null, 2)}`,
    );
  }

  logProcessingStart(context: AutoresponderDecisionContext): void {
    const logMessage = `[PROCESSING_START] Starting auto-responder evaluation | userId=${context.userId} threadId=${context.emailThreadId}${context.senderEmail ? ` sender=${context.senderEmail}` : ""}${context.subject ? ` subject="${context.subject}"` : ""}`;

    this.logger.debug(logMessage);
    writeToAutoresponderLog(logMessage);
  }

  logClassification(
    context: AutoresponderDecisionContext,
    classification: {
      isAutomated: boolean;
      isNewsletter: boolean;
      isColdOutreach: boolean;
      isBounce: boolean;
      isOutOfOffice: boolean;
      personalizationScore: number;
      reasons: string[];
    },
  ): void {
    const logEntry = {
      type: "CLASSIFICATION",
      ...context,
      classification,
      timestamp: new Date().toISOString(),
    };

    const logMessage = `[CLASSIFICATION] userId=${context.userId} threadId=${context.emailThreadId} | automated=${classification.isAutomated} newsletter=${classification.isNewsletter} coldOutreach=${classification.isColdOutreach} bounce=${classification.isBounce} ooo=${classification.isOutOfOffice} personalization=${classification.personalizationScore}`;

    this.logger.debug(logMessage);
    writeToAutoresponderLog(
      `${logMessage}\n  Details: ${JSON.stringify(logEntry, null, 2)}`,
    );
  }

  logPriorityCheck(
    context: AutoresponderDecisionContext,
    priorityLevel: "low" | "medium" | "high",
    threadStarCount: number,
    urgencyScore: number | null,
    configSettings: {
      sendForHighPriority: boolean;
      sendForStandardPriority: boolean;
      sendForLowPriority: boolean;
    },
  ): void {
    const logEntry = {
      type: "PRIORITY_CHECK",
      ...context,
      priorityLevel,
      threadStarCount,
      urgencyScore,
      configSettings,
      timestamp: new Date().toISOString(),
    };

    const logMessage = `[PRIORITY_CHECK] userId=${context.userId} threadId=${context.emailThreadId} | level=${priorityLevel} stars=${threadStarCount} urgency=${urgencyScore ?? "null"} | config: high=${configSettings.sendForHighPriority} standard=${configSettings.sendForStandardPriority} low=${configSettings.sendForLowPriority}`;

    this.logger.debug(logMessage);
    writeToAutoresponderLog(
      `${logMessage}\n  Details: ${JSON.stringify(logEntry, null, 2)}`,
    );
  }

  logSendAttempt(
    context: AutoresponderDecisionContext,
    templateUsed: string,
    responseSubject: string,
  ): void {
    const logMessage = `[SEND_ATTEMPT] Attempting to send auto-response | userId=${context.userId} threadId=${context.emailThreadId} template=${templateUsed} subject="${responseSubject}"`;

    this.logger.log(logMessage);
    writeToAutoresponderLog(logMessage);
  }

  logSendSuccess(
    context: AutoresponderDecisionContext,
    templateUsed: string,
    qaAnswerProvided: boolean,
  ): void {
    const logMessage = `[SEND_SUCCESS] Auto-response sent successfully | userId=${context.userId} threadId=${context.emailThreadId} template=${templateUsed} qaAnswer=${qaAnswerProvided}`;

    this.logger.log(logMessage);
    writeToAutoresponderLog(logMessage);
  }

  logSendError(
    context: AutoresponderDecisionContext,
    error: unknown,
    stage: string,
  ): void {
    const errorDetails = {
      type: "SEND_ERROR",
      ...context,
      stage,
      timestamp: new Date().toISOString(),
      errorType: (() => {
        if (error && typeof error === "object" && "code" in error) {
          return String((error as { code?: unknown }).code);
        }
        if (error && typeof error === "object" && "name" in error) {
          return String((error as { name?: unknown }).name);
        }
        return "Unknown";
      })(),
      errorMessage: (() => {
        if (error && typeof error === "object" && "message" in error) {
          return String((error as { message?: unknown }).message);
        }
        return String(error);
      })(),
      errorStack: error instanceof Error ? error.stack : undefined,
    };

    const logMessage = `[SEND_ERROR] Failed to send auto-response | userId=${context.userId} threadId=${context.emailThreadId} stage=${stage} error=${errorDetails.errorMessage}`;

    this.logger.error(logMessage);
    writeToAutoresponderLog(
      `${logMessage}\n  Error Details: ${JSON.stringify(errorDetails, null, 2)}`,
    );
  }

  logQueueJob(
    context: AutoresponderDecisionContext,
    jobId: string | null,
    success: boolean,
  ): void {
    const logMessage = success
      ? `[QUEUE_JOB] Job queued successfully | userId=${context.userId} threadId=${context.emailThreadId} jobId=${jobId}`
      : `[QUEUE_JOB_FAILED] Failed to queue job | userId=${context.userId} threadId=${context.emailThreadId}`;

    if (success) {
      this.logger.debug(logMessage);
    } else {
      this.logger.error(logMessage);
    }
    writeToAutoresponderLog(logMessage);
  }

  logSuppressionCheck(
    context: AutoresponderDecisionContext,
    suppressed: boolean,
    reason?: string,
  ): void {
    const logMessage = suppressed
      ? `[SUPPRESSION] Sender suppressed | userId=${context.userId} threadId=${context.emailThreadId} reason=${reason}`
      : `[SUPPRESSION] No suppression found | userId=${context.userId} threadId=${context.emailThreadId}`;

    this.logger.debug(logMessage);
    writeToAutoresponderLog(logMessage);
  }

  logConfigCheck(
    context: AutoresponderDecisionContext,
    enabled: boolean,
    config?: Record<string, unknown>,
  ): void {
    const logMessage = `[CONFIG] Auto-responder ${enabled ? "enabled" : "disabled"} | userId=${context.userId}`;

    this.logger.debug(logMessage);
    if (config) {
      writeToAutoresponderLog(
        `${logMessage}\n  Config: ${JSON.stringify(config, null, 2)}`,
      );
    } else {
      writeToAutoresponderLog(logMessage);
    }
  }
}

export const autoresponderLogger = new AutoresponderLogger();

try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  if (!fs.existsSync(AUTORESPONDER_LOG_FILE)) {
    fs.writeFileSync(
      AUTORESPONDER_LOG_FILE,
      `[${new Date().toISOString()}] Autoresponder log file initialized\n`,
      "utf8",
    );
  }
} catch (error) {
  console.error("Failed to initialize autoresponder log file:", error);
}
