import { AsyncLocalStorage } from "async_hooks";

interface RequestEncryptionContext {
  key: Buffer;
  /** Per-request consecutive-decryption-failure counter (avoids cross-tenant DoS). */
  decryptFailures: number;
}

const storage = new AsyncLocalStorage<RequestEncryptionContext>();

/**
 * Runs `callback` with the given AES data key available to all synchronous and async
 * operations spawned within the call (via Node.js AsyncLocalStorage).
 * TypeORM column transformers call `getCurrentUserKey()` to pick up the key.
 */
export function runWithUserKey<T>(key: Buffer, callback: () => T): T {
  return storage.run({ key, decryptFailures: 0 }, callback);
}

/**
 * Returns the current request's per-user AES data key, or undefined when
 * running outside a request context (workers, unauthenticated routes, etc.).
 */
export function getCurrentUserKey(): Buffer | undefined {
  return storage.getStore()?.key;
}

/**
 * Returns the per-request decryption failure counter, or undefined when running
 * outside a request context (global static counter is used in that case).
 */
export function getRequestDecryptContext():
  | RequestEncryptionContext
  | undefined {
  return storage.getStore();
}
