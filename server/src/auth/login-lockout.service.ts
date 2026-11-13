import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  AUTH_ERROR_CODES,
  LOGIN_LOCKOUT,
} from "../constants/auth-security.constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { User } from "../database/entities/user.entity";

interface UnknownEmailRecord {
  failedAttempts: number;
  lockedUntil: number;
  lastSeenAt: number;
}

/**
 * How long the account stays locked after its `failedAttempts`-th
 * consecutive failure: nothing below the threshold, then BASE_LOCK_MS
 * doubling per extra failure, capped at MAX_LOCK_MS.
 */
export function lockDurationMs(failedAttempts: number): number {
  const beyond = failedAttempts - LOGIN_LOCKOUT.MAX_FAILED_ATTEMPTS;
  if (beyond < 0) return 0;
  return Math.min(
    LOGIN_LOCKOUT.BASE_LOCK_MS * 2 ** beyond,
    LOGIN_LOCKOUT.MAX_LOCK_MS,
  );
}

/** 429 for a locked account. Identical for addresses with no account. */
export class AccountLockedException extends HttpException {
  constructor(lockedUntil: Date) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((lockedUntil.getTime() - Date.now()) / MS_PER_SECOND),
    );
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        retryAfterSeconds,
        message:
          "Too many failed sign-in attempts. Try again later, or reset your password.",
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Per-account lockout for password sign-in, on top of the per-IP throttle.
 *
 * Counts consecutive wrong passwords on the user row; from the
 * MAX_FAILED_ATTEMPTS-th on, each failure locks the account for an
 * increasing period. While locked the password isn't even checked. A
 * successful sign-in or password reset clears it.
 *
 * Addresses with no account get the same responses from a bounded in-memory
 * tracker, so a lockout never confirms that an address is registered.
 */
@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);
  private readonly unknownEmails = new Map<string, UnknownEmailRecord>();

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  /** Throws AccountLockedException while the account is locked. */
  assertNotLocked(user: Pick<User, "loginLockedUntil">): void {
    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      throw new AccountLockedException(user.loginLockedUntil);
    }
  }

  /** Records a wrong password and locks the account once over the threshold. */
  async recordFailure(userId: string): Promise<void> {
    const rows: Array<{ failedLoginAttempts: number }> =
      await this.userRepository.query(
        `UPDATE users SET "failedLoginAttempts" = "failedLoginAttempts" + 1
         WHERE id = $1 RETURNING "failedLoginAttempts"`,
        [userId],
      );
    const failedAttempts = this.firstAttemptCount(rows);
    const lockMs = lockDurationMs(failedAttempts);
    if (lockMs === 0) return;
    await this.userRepository.update(userId, {
      loginLockedUntil: new Date(Date.now() + lockMs),
    });
    this.logger.warn(
      `[LOGIN_LOCKOUT] User ${userId} locked for ${lockMs}ms after ${failedAttempts} failed sign-ins`,
    );
  }

  /** Clears the failure count and any lock. */
  async recordSuccess(
    user: Pick<User, "id" | "failedLoginAttempts" | "loginLockedUntil">,
  ): Promise<void> {
    if (!user.failedLoginAttempts && !user.loginLockedUntil) return;
    await this.userRepository.update(user.id, {
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    });
  }

  /** Same as assertNotLocked + recordFailure, for an address with no account. */
  recordUnknownEmailAttempt(emailHash: string): void {
    const now = Date.now();
    this.pruneUnknownEmails(now);
    const record = this.unknownEmails.get(emailHash) ?? {
      failedAttempts: 0,
      lockedUntil: 0,
      lastSeenAt: now,
    };
    if (record.lockedUntil > now) {
      throw new AccountLockedException(new Date(record.lockedUntil));
    }
    record.failedAttempts += 1;
    record.lastSeenAt = now;
    const lockMs = lockDurationMs(record.failedAttempts);
    if (lockMs > 0) record.lockedUntil = now + lockMs;
    // Re-insert so Map order tracks recency for the size cap below.
    this.unknownEmails.delete(emailHash);
    this.unknownEmails.set(emailHash, record);
  }

  private firstAttemptCount(rows: unknown): number {
    // TypeORM returns [rows, affectedCount] for UPDATE ... RETURNING on Postgres.
    const list = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
    const first = Array.isArray(list) ? list[0] : undefined;
    return Number(first?.failedLoginAttempts ?? 0);
  }

  private pruneUnknownEmails(now: number): void {
    for (const [key, record] of this.unknownEmails) {
      const idle =
        now - record.lastSeenAt > LOGIN_LOCKOUT.UNKNOWN_EMAIL_TRACKER_IDLE_MS;
      const overCap =
        this.unknownEmails.size >=
        LOGIN_LOCKOUT.UNKNOWN_EMAIL_TRACKER_MAX_ENTRIES;
      if (!idle && !overCap) break;
      this.unknownEmails.delete(key);
    }
  }
}
