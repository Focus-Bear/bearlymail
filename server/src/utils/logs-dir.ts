import * as fs from "fs";
import * as path from "path";

import { NODE_ENV_VALUES } from "../constants/domain-types";

export const isDevelopment =
  process.env.NODE_ENV !== NODE_ENV_VALUES.PRODUCTION;

/**
 * Absolute path to the logs directory used by every per-feature file logger
 * (auth-logger, query-logger, search-logger, etc.). Resolved once at module
 * load against `process.cwd()` so every consumer sees the same path.
 */
export const LOGS_DIR = path.join(process.cwd(), "logs");

/**
 * Ensure the logs directory exists. Safe to call at module load or in a
 * constructor.
 *
 * - **Production**: no-op. Every file logger gates its writes on
 *   `isDevelopment` (writes return early), AND the hardened `USER node`
 *   Dockerfile makes `/app` non-writeable — so an actual `mkdirSync` here
 *   throws `EACCES` and crashes boot before NestFactory even starts. We've
 *   eaten that incident twice; this helper exists so no future logger ships
 *   the same bomb.
 * - **Development**: creates the dir if missing. Silently swallows errors
 *   (sandboxed dev environments without write perms should still boot).
 *
 * Use this everywhere instead of inlining `mkdirSync` at module load.
 */
export function ensureLogsDirSync(): void {
  if (!isDevelopment) return;
  try {
    // `mkdirSync({ recursive: true })` is itself a no-op when the dir exists,
    // but this function is called on every write in auth-logger and
    // autoresponder-logger — skipping the mkdir syscall when the dir is
    // already there is cheap insurance on the hot path.
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  } catch {
    // Best-effort; per-write callers also catch.
  }
}
