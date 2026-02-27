/**
 * Shared utilities for PostHog error tracking.
 * Used by both the ErrorTrackingService and global error handlers.
 */

export interface ExceptionFrame {
  filename: string;
  function: string;
  lineno: number;
  colno: number;
  in_app: boolean;
}

export interface PosthogExceptionPayload {
  type: string;
  value: string;
  platform: string;
  mechanism: {
    handled: boolean;
    synthetic: boolean;
  };
  stacktrace: {
    type: "raw";
    frames: ExceptionFrame[];
  };
}

/**
 * Parse a Node.js Error.stack string into an array of frame objects.
 * PostHog Error Tracking requires stacktrace.frames to be an array,
 * not a raw string, in order to display and group errors correctly.
 */
export function parseStackTrace(stack: string): ExceptionFrame[] {
  if (!stack) return [];

  const frames: ExceptionFrame[] = [];

  for (const line of stack.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at ")) continue;

    // "at FunctionName (filename:line:col)" or "at async FunctionName (...)"
    const withName = trimmed.match(
      /^at\s+(?:async\s+)?(.+?)\s+\((.+?):(\d+):(\d+)\)$/,
    );
    if (withName) {
      const filename = withName[2];
      frames.push({
        function: withName[1],
        filename,
        lineno: parseInt(withName[3], 10),
        colno: parseInt(withName[4], 10),
        in_app:
          !filename.includes("node_modules") &&
          !filename.startsWith("node:") &&
          !filename.startsWith("internal/"),
      });
      continue;
    }

    // "at filename:line:col" (anonymous)
    const anonymous = trimmed.match(/^at\s+(?:async\s+)?(.+?):(\d+):(\d+)$/);
    if (anonymous) {
      const filename = anonymous[1];
      frames.push({
        function: "<anonymous>",
        filename,
        lineno: parseInt(anonymous[2], 10),
        colno: parseInt(anonymous[3], 10),
        in_app:
          !filename.includes("node_modules") &&
          !filename.startsWith("node:") &&
          !filename.startsWith("internal/"),
      });
    }
  }

  return frames;
}

/**
 * Create a PostHog exception payload from an Error object.
 * This ensures consistent formatting across all error tracking code.
 *
 * @param error - The error object
 * @param handled - Whether the error was handled (caught) or unhandled (uncaughtException, unhandledRejection)
 * @returns PostHog exception payload object
 */
export function createPosthogExceptionPayload(
  error: Error,
  handled: boolean,
): PosthogExceptionPayload {
  return {
    type: error.name,
    value: error.message,
    platform: "node",
    mechanism: {
      handled,
      synthetic: false,
    },
    stacktrace: {
      type: "raw",
      frames: parseStackTrace(error.stack || ""),
    },
  };
}
