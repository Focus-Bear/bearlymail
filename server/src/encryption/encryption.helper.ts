import * as crypto from "crypto";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import { captureGlobalEvent } from "../error-tracking/error-tracking-setup";
// `category-format.util` is intentionally entity-free so we can import it here
// without re-creating the cycle that issue #1700 fixed (see file header).
import { parseCategoryName } from "../utils/category-format.util";
import { logError } from "../utils/logger";
import { encryptionKeyProvider } from "./encryption-key-provider";
import {
  getCurrentUserKey,
  getRequestDecryptContext,
} from "./user-encryption-context";

const MAX_CONSECUTIVE_DECRYPT_FAILURES = 3;
const DECRYPT_FAILURE_EVENT_THROTTLE_MS = 60_000;

/**
 * Static encryption helper for use in TypeORM column transformers.
 * Delegates key management to encryptionKeyProvider — throws if accessed before
 * encryptionKeyProvider.initialize() has been called in main.ts.
 *
 * When KMS envelope encryption is enabled (`KMS_KEY_ID` set), `getKey()` returns the
 * per-user key from AsyncLocalStorage when available, otherwise falls back to the global key.
 * `getGlobalKey()` always returns the global derived key (used for the User entity itself).
 */
class EncryptionHelper {
  private static algorithm = "aes-256-gcm" as const;
  private static ivLength = ENCRYPTION_CONSTANTS.IV_LENGTH;
  /**
   * Global fallback failure counter for worker/non-request contexts.
   * Request contexts use a per-request counter via AsyncLocalStorage (see
   * getRequestDecryptContext()) to prevent cross-tenant DoS.
   */
  static globalConsecutiveFailures = 0;
  private static lastDecryptFailureEventMs = 0;

  private static getKey(): Buffer {
    return encryptionKeyProvider.getKey();
  }

  private static getGlobalKey(): Buffer {
    return encryptionKeyProvider.getGlobalKey();
  }

  /**
   * Throwing counterpart of `silentDecryptWithKey`. Surfaces the underlying
   * crypto error (auth tag mismatch, invalid key length, etc.) on failure.
   * Use in boot checks and admin diagnostics where the specific error must
   * bubble up. Caller is responsible for shape validation — use
   * `looksLikeEncryptedPayload` first if the input might be plaintext.
   */
  static decryptWithExplicitKey(encryptedText: string, key: Buffer): string {
    const parts = encryptedText.split(":");
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(
      EncryptionHelper.algorithm,
      key,
      iv,
      { authTagLength: 16 },
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * Try to decrypt with an explicit key. Returns null on any failure (wrong key,
   * malformed shape, IV length mismatch). Does NOT log — use this in code that
   * expects many decrypt failures (e.g. the re-encryption job, where every legacy
   * row fails its first decrypt attempt before falling back to the global key).
   *
   * Returns the original input only when it does not look like ciphertext at all
   * (no separator / wrong IV length) — same convention as `tryDecrypt`.
   */
  static silentDecryptWithKey(
    encryptedText: string | null | undefined,
    key: Buffer,
  ): string | null {
    if (!encryptedText) return null;
    if (!encryptedText.includes(":")) return encryptedText;
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;
    const iv = Buffer.from(parts[0], "hex");
    if (iv.length !== EncryptionHelper.ivLength) return encryptedText;
    try {
      return EncryptionHelper.decryptWithExplicitKey(encryptedText, key);
    } catch {
      return null;
    }
  }

  static encrypt(text: string | null | undefined): string | null {
    if (!text) return null;

    const key = this.getKey();
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(
        this.algorithm,
        key,
        iv,
      ) as crypto.CipherGCM;

      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      // Combine IV, authTag, and encrypted data
      return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (error) {
      logError(
        "Encryption error",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error("Failed to encrypt data");
    }
  }

  static decrypt(encryptedText: string | null | undefined): string | null {
    if (!encryptedText) return null;

    // Check if this is already decrypted (for backwards compatibility during migration)
    if (!encryptedText.includes(":")) {
      return encryptedText;
    }

    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      // Not in expected format, might be plaintext
      return encryptedText;
    }

    const key = this.getKey();

    try {
      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, "hex");
      // Validate IV length matches expected size — strings with 2 colons (e.g. timestamps
      // like "12:30:45") would otherwise reach createDecipheriv and throw
      // "Invalid initialization vector"
      if (iv.length !== this.ivLength) {
        return encryptedText;
      }
      const authTag = Buffer.from(authTagHex, "hex");

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
        authTagLength: 16,
      }) as crypto.DecipherGCM;
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      // Do NOT call logError() here. The hot caller is tryDecrypt(), which
      // catches this throw and is invoked once per encrypted column per row
      // hydrated by TypeORM. logError forwards to PostHog, which previously
      // captured 250k+ events from a single user with bad ciphertext (see
      // PR #2036, where the same pattern was removed from tryDecrypt's own
      // catch). tryDecrypt has its own throttled `captureGlobalEvent` for
      // telemetry and a `console.warn` for human log readers; the other
      // direct callers of decrypt() (boot checks, admin diagnostics) propagate
      // the error and can decide their own logging.
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Decrypt using a passphrase with the same scrypt derivation as the running server key.
   * For admin diagnostics only — does not affect the tryDecrypt circuit-breaker.
   */
  static decryptWithKeyString(
    encryptedText: string | null | undefined,
    keyMaterial: string,
  ): string | null {
    if (!encryptedText) return null;

    if (!encryptedText.includes(":")) {
      return encryptedText;
    }

    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      return encryptedText;
    }

    const key = crypto.scryptSync(
      keyMaterial,
      "salt",
      ENCRYPTION_CONSTANTS.KEY_LENGTH,
    );

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    if (iv.length !== EncryptionHelper.ivLength) {
      return encryptedText;
    }
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(
      EncryptionHelper.algorithm,
      key,
      iv,
      { authTagLength: 16 },
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * True when the string matches stored AES-256-GCM column shape (`ivHex:tagHex:cipherHex`).
   * Used to treat tryDecrypt fail-open ciphertext as absent plaintext (e.g. inbox category bucketing).
   */
  static looksLikeEncryptedPayload(text: string): boolean {
    if (!text || !text.includes(":")) return false;
    const parts = text.split(":");
    if (parts.length !== 3) return false;
    try {
      const iv = Buffer.from(parts[0], "hex");
      return iv.length === this.ivLength;
    } catch {
      return false;
    }
  }

  /**
   * Safe decrypt — catches errors and returns `null` on failure instead of
   * throwing. Use this in data-mapping contexts (TypeORM transformers, row
   * mappers, background processors) where a single undecryptable value must not
   * crash the request or the (multi-tenant) worker.
   *
   * On failure it returns `null` — NEVER the raw ciphertext — and emits throttled
   * `encryption-decrypt-failure` telemetry (the canonical signal; alarm on it).
   * It does NOT crash the process: under per-user KMS encryption, a cross-user
   * read without the per-user key legitimately fails the global-key fallback,
   * and crashing on that would take down every tenant. A genuinely wrong/rotated
   * GLOBAL key is caught at boot by `verifyExistingDataDecryption()`.
   *
   * Null/empty values and plaintext pass-through do NOT count as failures — only
   * actual ciphertext decryption attempts do (kept for the telemetry counter).
   *
   * Keep the throwing `decrypt()` for boot checks and token paths where failure must be fatal.
   *
   * @param field  Optional `table.column` label (from the owning transformer)
   *               included in the failure log — the stack trace alone cannot
   *               name the column because TypeORM hydration frames all live in
   *               node_modules.
   */
  static tryDecrypt(
    encryptedText: string | null | undefined,
    field?: string,
  ): string | null {
    if (!encryptedText) return null;

    if (!encryptedText.includes(":")) return encryptedText;
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;
    const ivLength = Buffer.from(parts[0], "hex").length;
    if (ivLength !== EncryptionHelper.ivLength) return encryptedText;

    try {
      const result = EncryptionHelper.decrypt(encryptedText);
      EncryptionHelper.resetFailureCount();
      return result;
    } catch (primaryError) {
      // When KMS is enabled, data may have been written with the global key (by worker
      // processes or before KMS was enabled). Try the global key as a fallback.
      if (process.env.KMS_KEY_ID) {
        try {
          const globalKey = encryptionKeyProvider.getGlobalKey();
          const result = EncryptionHelper.decryptWithExplicitKey(
            encryptedText,
            globalKey,
          );
          EncryptionHelper.resetFailureCount();
          return result;
        } catch {
          // Global key also failed — fall through to error handling
        }
      }

      const failures = EncryptionHelper.incrementFailureCount();

      const now = Date.now();
      if (
        now - EncryptionHelper.lastDecryptFailureEventMs >
        DECRYPT_FAILURE_EVENT_THROTTLE_MS
      ) {
        EncryptionHelper.lastDecryptFailureEventMs = now;
        captureGlobalEvent("encryption-decrypt-failure", {
          error:
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError),
          ciphertextPrefix: encryptedText
            ? encryptedText.slice(
                0,
                ENCRYPTION_CONSTANTS.CIPHERTEXT_DEBUG_PREFIX_LENGTH,
              )
            : "(null)",
          consecutiveFailures: failures,
          keyFingerprint: encryptionKeyProvider.getFingerprint(),
          field: field ?? "(unlabelled)",
          userKeyInAls: getCurrentUserKey() !== undefined,
        });
      }

      // A single undecryptable value must NOT crash the process and must NEVER
      // be returned as raw ciphertext.
      //
      // Previously this crashed the worker after N consecutive failures. Under
      // per-user (KMS envelope) encryption that's actively harmful: a
      // cross-user/background read that lacks the per-user key legitimately
      // fails the global-key fallback, and the *process-global* counter then
      // took down request-serving for every tenant. (See the snooze-cron
      // worker crash-loop.) A genuinely wrong/rotated GLOBAL key is caught at
      // boot by verifyExistingDataDecryption() — that, not a runtime counter,
      // is the correct fail-fast gate.
      //
      // So: return null (never ciphertext), and lean on the throttled
      // `encryption-decrypt-failure` telemetry above + the log below as the
      // signal. Escalate the log to error level once failures are sustained so
      // a real spike is still loud, but never throw.
      const message =
        primaryError instanceof Error
          ? primaryError.message
          : String(primaryError);
      // Include the ciphertext prefix (locates the row via a SQL LIKE scan),
      // the column label + reading call site (name the code path that lost the
      // key context), and whether a per-user key was in ALS (separates a
      // context-loss read from a wrong-key/corrupt row) — without these the
      // DecryptFailures alarm is untriageable from logs alone. The alarm's
      // metric filter matches on the literal "tryDecrypt: decryption failed"
      // prefix; keep that string intact.
      const detail =
        `tryDecrypt: decryption failed (run of ${failures}) — ` +
        `returning null (never raw ciphertext): ${message} ` +
        `[ciphertext=${encryptedText.slice(0, ENCRYPTION_CONSTANTS.CIPHERTEXT_DEBUG_PREFIX_LENGTH)}… ` +
        `field=${field ?? "(unlabelled)"} ` +
        `userKey=${getCurrentUserKey() !== undefined ? "present" : "absent"} ` +
        `readAt=${EncryptionHelper.describeCallSite()}]`;
      if (failures >= MAX_CONSECUTIVE_DECRYPT_FAILURES) {
        // Sustained failures — likely a context/key problem worth investigating
        // (e.g. a cross-user job reading per-user data without withUserKey).
        // Loud, but NON-fatal. console.* (not logError) to avoid PostHog quota
        // burn; the throttled captureGlobalEvent above is the canonical metric.
        // Rate-limit console.error to avoid CloudWatch flooding when a worker
        // grinds through thousands of undecryptable rows: log the first sustained
        // failure, then only every 100th, so a real spike is still loud but a
        // bulk-read storm doesn't burn log-ingestion budget.
        if (
          failures === MAX_CONSECUTIVE_DECRYPT_FAILURES ||
          failures % 100 === 0
        ) {
          console.error(detail);
        }
      } else {
        console.warn(detail);
      }
      return null;
    }
  }

  /**
   * First app stack frames outside this helper — identifies WHICH read failed
   * (entity transformer chains are invisible in the metric otherwise). Only
   * invoked on the failure path, so the Error capture is off the hot path.
   *
   * TypeORM entity hydration has NO app frames on its synchronous stack (the
   * app caller is across an async boundary), so when the app-frame filter
   * comes up empty fall back to the first library frames — "lib:typeorm
   * hydration" is still far more useful than "unknown".
   */
  private static describeCallSite(): string {
    const frames = (new Error().stack?.split("\n").slice(1) ?? [])
      .filter((frame) => !frame.includes("encryption.helper"))
      .map((frame) => frame.trim().replace(/^at\s+/, ""));
    const appFrames = frames.filter(
      (frame) =>
        !frame.includes("node_modules") && !frame.includes("node:internal"),
    );
    if (appFrames.length > 0) return appFrames.slice(0, 3).join(" <- ");
    const libFrames = frames.filter(
      (frame) => !frame.includes("node:internal"),
    );
    if (libFrames.length > 0)
      return `lib:${libFrames.slice(0, 2).join(" <- ")}`;
    return "unknown";
  }

  private static resetFailureCount(): void {
    const ctx = getRequestDecryptContext();
    if (ctx) {
      ctx.decryptFailures = 0;
    } else {
      EncryptionHelper.globalConsecutiveFailures = 0;
    }
  }

  private static incrementFailureCount(): number {
    const ctx = getRequestDecryptContext();
    if (ctx) {
      ctx.decryptFailures++;
      return ctx.decryptFailures;
    }
    EncryptionHelper.globalConsecutiveFailures++;
    return EncryptionHelper.globalConsecutiveFailures;
  }

  /**
   * Encrypt using the global derived key (ENCRYPTION_KEY), regardless of any per-user
   * KMS key in AsyncLocalStorage. Used for User entity fields to avoid chicken-and-egg
   * with JWT authentication (which loads the User before the interceptor sets the ALS key).
   */
  static encryptWithGlobalKey(text: string | null | undefined): string | null {
    if (!text) return null;
    const key = this.getGlobalKey();
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(
        this.algorithm,
        key,
        iv,
      ) as crypto.CipherGCM;
      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag();
      return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (error) {
      logError(
        "Encryption error (global key)",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error("Failed to encrypt data");
    }
  }

  /** Decrypt using the global key, fail-open (same semantics as tryDecrypt). */
  static tryDecryptWithGlobalKey(
    encryptedText: string | null | undefined,
    field?: string,
  ): string | null {
    if (!encryptedText) return null;
    if (!encryptedText.includes(":")) return encryptedText;
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;
    const iv = Buffer.from(parts[0], "hex");
    if (iv.length !== EncryptionHelper.ivLength) return encryptedText;

    try {
      return EncryptionHelper.decryptWithExplicitKey(
        encryptedText,
        encryptionKeyProvider.getGlobalKey(),
      );
    } catch (error) {
      // Plain console.warn instead of logError() — this is the fail-open path
      // for the User entity's per-column transformer, so it runs on every
      // authenticated request and a single bad ciphertext can fire it many
      // times per second. logError forwards to PostHog and exhausts the
      // error-tracking quota; the warn line is for human log readers only.
      // Mirrors the analogous decision in tryDecrypt() above. Pass the Error
      // as a second arg so the stack trace is preserved in CloudWatch (vs.
      // stringifying just the message).
      console.warn(
        `tryDecryptWithGlobalKey: decryption failed — returning raw ciphertext ` +
          `[ciphertext=${encryptedText.slice(0, ENCRYPTION_CONSTANTS.CIPHERTEXT_DEBUG_PREFIX_LENGTH)}… ` +
          `field=${field ?? "(unlabelled)"}]`,
        error,
      );
      return encryptedText;
    }
  }

  static hashEmail(email: string): string {
    if (!email) return "";
    return crypto
      .createHash("sha256")
      .update(email.toLowerCase().trim())
      .digest("hex");
  }
}

/**
 * Brand attached to every encryption column transformer so consumers — chiefly
 * the re-encryption table discovery — can recognise them by CAPABILITY rather
 * than by object identity. Identity breaks the moment a per-column factory
 * instance (carrying a `field` label) is used instead of the shared singleton,
 * which silently drops that table from re-encryption scope.
 */
export const ENCRYPTED_TRANSFORMER_META = Symbol(
  "bearlymail.encryptedTransformerMeta",
);

/** Which key a transformer uses — the per-user KMS data key, or the global key. */
export const ENCRYPTED_TRANSFORMER_SCOPE = {
  USER: "user",
  GLOBAL: "global",
} as const;

/** Whether a transformer's decrypted value is JSON, plain text, or an email. */
export const ENCRYPTED_TRANSFORMER_KIND = {
  TEXT: "text",
  JSON: "json",
  EMAIL: "email",
} as const;

export interface EncryptedTransformerMeta {
  /** Whether the decrypted value is JSON (must be JSON.parsed) or a plain string. */
  kind: (typeof ENCRYPTED_TRANSFORMER_KIND)[keyof typeof ENCRYPTED_TRANSFORMER_KIND];
  /** Which key the transformer uses — the per-user KMS data key, or the global key. */
  scope: (typeof ENCRYPTED_TRANSFORMER_SCOPE)[keyof typeof ENCRYPTED_TRANSFORMER_SCOPE];
  /** Optional `table.column` label, surfaced in decrypt-failure logs for debugging. */
  field?: string;
}

function brandTransformer<T extends object>(
  transformer: T,
  meta: EncryptedTransformerMeta,
): T {
  return Object.assign(transformer, { [ENCRYPTED_TRANSFORMER_META]: meta });
}

/** Read the encryption brand off a TypeORM transformer, if it has one. */
export function getEncryptedTransformerMeta(
  transformer: unknown,
): EncryptedTransformerMeta | undefined {
  if (
    transformer &&
    (typeof transformer === "object" || typeof transformer === "function") &&
    ENCRYPTED_TRANSFORMER_META in transformer
  ) {
    return (transformer as Record<symbol, unknown>)[
      ENCRYPTED_TRANSFORMER_META
    ] as EncryptedTransformerMeta;
  }
  return undefined;
}

const UNLABELLED_FIELD = "(unlabelled column)";

/**
 * Shared decrypt-then-parse for the JSON transformers. On failure it returns
 * null (never raw ciphertext) and, only when the value is genuinely NOT
 * encrypted-shaped (i.e. plaintext / bypassed-transformer data — the thing
 * worth knowing about), logs a single line NAMING THE FIELD so an operator can
 * see exactly which `table.column` holds the bad data. If the value is still
 * encrypted-shaped, tryDecrypt fail-opened and there's nothing useful to say.
 *
 * Plain console.warn (never logError): logError dumps the full TypeORM
 * hydration stack AND forwards a PostHog event per failing row/column, which
 * was the single largest source of CloudWatch log spam.
 */
function parseDecryptedJson(
  decrypted: string,
  transformerName: string,
  field: string | undefined,
): unknown {
  try {
    return JSON.parse(decrypted);
  } catch (err) {
    if (EncryptionHelper.looksLikeEncryptedPayload(decrypted)) {
      return null;
    }
    console.warn(
      `${transformerName}: failed to parse decrypted JSON for ${
        field ?? UNLABELLED_FIELD
      }, returning null (${err instanceof Error ? err.message : String(err)})`,
    );
    return null;
  }
}

/**
 * TypeORM transformer factory for encrypted text columns. Pass a `table.column`
 * label so any future diagnostics can attribute it. Uses tryDecrypt on read so
 * a single corrupted column does not crash entity hydration.
 */
export function makeEncryptedColumnTransformer(field?: string) {
  return brandTransformer(
    {
      to: (value: string | null | undefined): string | null =>
        EncryptionHelper.encrypt(value),
      from: (value: string | null | undefined): string | null =>
        EncryptionHelper.tryDecrypt(value, field),
    },
    { kind: "text", scope: "user", field },
  );
}
/** Shared, field-less transformer for the common case. */
export const encryptedColumnTransformer = makeEncryptedColumnTransformer();

/**
 * For email addresses — we store `emailHash` (SHA-256, queryable) separately and
 * encrypt the actual `email`. Uses tryDecrypt on read so a corrupted email
 * column does not crash entity hydration.
 */
export function makeEmailTransformer(field?: string) {
  return brandTransformer(
    {
      to: (value: string | null | undefined): string | null =>
        EncryptionHelper.encrypt(value),
      from: (value: string | null | undefined): string | null =>
        EncryptionHelper.tryDecrypt(value, field),
    },
    { kind: "email", scope: "user", field },
  );
}
export const emailTransformer = makeEmailTransformer();

/**
 * TypeORM transformer factory for encrypted JSON columns. Pass a `table.column`
 * label so the decrypt-failure log names exactly which column holds bad data.
 */
export function makeEncryptedJsonTransformer(field?: string) {
  return brandTransformer(
    {
      to: (value: unknown): string | null => {
        if (value === null || value === undefined) return null;
        return EncryptionHelper.encrypt(JSON.stringify(value));
      },
      from: (value: string | null | undefined): unknown => {
        const decrypted = EncryptionHelper.tryDecrypt(value, field);
        if (!decrypted) return null;
        return parseDecryptedJson(decrypted, "encryptedJsonTransformer", field);
      },
    },
    { kind: "json", scope: "user", field },
  );
}
export const encryptedJsonTransformer = makeEncryptedJsonTransformer();

/**
 * TypeORM transformers for User entity fields.
 *
 * Always use the global ENCRYPTION_KEY — never the per-user KMS key.
 * Reason: the JWT guard loads the User entity before the UserEncryptionInterceptor
 * sets the per-user key in AsyncLocalStorage, causing a chicken-and-egg failure.
 */
export function makeGlobalEncryptedColumnTransformer(field?: string) {
  return brandTransformer(
    {
      to: (value: string | null | undefined): string | null =>
        EncryptionHelper.encryptWithGlobalKey(value),
      from: (value: string | null | undefined): string | null =>
        EncryptionHelper.tryDecryptWithGlobalKey(value, field),
    },
    { kind: "text", scope: "global", field },
  );
}
export const globalEncryptedColumnTransformer =
  makeGlobalEncryptedColumnTransformer();

export function makeGlobalEmailTransformer(field?: string) {
  return brandTransformer(
    {
      to: (value: string | null | undefined): string | null =>
        EncryptionHelper.encryptWithGlobalKey(value),
      from: (value: string | null | undefined): string | null =>
        EncryptionHelper.tryDecryptWithGlobalKey(value, field),
    },
    { kind: "email", scope: "global", field },
  );
}
export const globalEmailTransformer = makeGlobalEmailTransformer();

export function makeGlobalEncryptedJsonTransformer(field?: string) {
  return brandTransformer(
    {
      to: (value: unknown): string | null => {
        if (value === null || value === undefined) return null;
        return EncryptionHelper.encryptWithGlobalKey(JSON.stringify(value));
      },
      from: (value: string | null | undefined): unknown => {
        const decrypted = EncryptionHelper.tryDecryptWithGlobalKey(
          value,
          field,
        );
        if (!decrypted) return null;
        return parseDecryptedJson(
          decrypted,
          "globalEncryptedJsonTransformer",
          field,
        );
      },
    },
    { kind: "json", scope: "global", field },
  );
}
export const globalEncryptedJsonTransformer =
  makeGlobalEncryptedJsonTransformer();

/**
 * Shared helper: decrypt an encrypted contextValue and extract the display name.
 *
 * EMAIL_CATEGORY contextValue is stored as "Category Name - optional description"
 * (encrypted at rest). This helper decrypts and returns only the name part.
 *
 * Usage:
 *   decryptContextValue(row.category)       // → "Newsletters" | null
 *   decryptContextValue(ctx.contextValue)   // → "Customer Support" | null
 *
 * @param raw  Encrypted (or plaintext) contextValue string from a raw query result
 * @returns    The category display name (before " - "), or null if input is null/empty
 */
export function decryptContextValue(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const decrypted = EncryptionHelper.tryDecrypt(raw);
  if (!decrypted) return null;
  return parseCategoryName(decrypted);
}

export { EncryptionHelper };
