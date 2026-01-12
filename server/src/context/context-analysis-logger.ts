import * as fs from "fs";
import * as path from "path";

// Ensure logs directory exists
const LOGS_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const ANALYSIS_LOG_FILE = path.join(LOGS_DIR, "analyse-context.log");

/**
 * Write a log message to the analyse-emails.log file AND console
 * Always logs to console, only writes to file in local development
 */
export function writeAnalysisLog(
  message: string,
  level: "log" | "error" | "warn" | "debug" = "log",
) {
  const timestamp = new Date().toISOString();
  const logPrefix = `[${timestamp}] [${level.toUpperCase()}]`;

  // Always log to console for visibility
  const consoleMessage = `${logPrefix} ${message}`;
  switch (level) {
    case "error":
      // eslint-disable-next-line no-console
      console.error(consoleMessage);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(consoleMessage);
      break;
    case "debug":
      // eslint-disable-next-line no-console
      console.debug(consoleMessage);
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(consoleMessage);
  }

  // Only log to file in local development
  const dbHost = process.env.DB_HOST;
  const nodeEnv = process.env.NODE_ENV;
  const isLocal =
    nodeEnv !== "production" &&
    (dbHost === "localhost" || dbHost === "127.0.0.1" || !dbHost);

  if (!isLocal) {
    return; // Don't log to file in production
  }

  try {
    const logLine = `${logPrefix} ${message}\n`;
    fs.appendFileSync(ANALYSIS_LOG_FILE, logLine, "utf8");
  } catch (err) {
    // Log error to console (but don't break the app)
    // eslint-disable-next-line no-console
    console.error(
      `Failed to write to analysis log file (${ANALYSIS_LOG_FILE}):`,
      err,
    );
  }
}

/**
 * Clear the analysis log file (useful for testing)
 */
export function clearAnalysisLog() {
  try {
    if (fs.existsSync(ANALYSIS_LOG_FILE)) {
      fs.writeFileSync(ANALYSIS_LOG_FILE, "", "utf8");
    }
  } catch (err) {
    // Silently fail
  }
}
