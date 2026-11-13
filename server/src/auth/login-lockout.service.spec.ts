import { Repository } from "typeorm";

import {
  LOGIN_LOCKOUT,
  loginThrottleLimit,
} from "../constants/auth-security.constants";
import { User } from "../database/entities/user.entity";
import {
  AccountLockedException,
  lockDurationMs,
  LoginLockoutService,
} from "./login-lockout.service";

describe("lockDurationMs", () => {
  it("doesn't lock below the threshold", () => {
    expect(lockDurationMs(LOGIN_LOCKOUT.MAX_FAILED_ATTEMPTS - 1)).toBe(0);
  });

  it("doubles per extra failure and caps", () => {
    const max = LOGIN_LOCKOUT.MAX_FAILED_ATTEMPTS;
    expect(lockDurationMs(max)).toBe(LOGIN_LOCKOUT.BASE_LOCK_MS);
    expect(lockDurationMs(max + 1)).toBe(LOGIN_LOCKOUT.BASE_LOCK_MS * 2);
    expect(lockDurationMs(max + 50)).toBe(LOGIN_LOCKOUT.MAX_LOCK_MS);
  });
});

describe("LoginLockoutService", () => {
  let repository: { query: jest.Mock; update: jest.Mock };
  let service: LoginLockoutService;

  beforeEach(() => {
    repository = { query: jest.fn(), update: jest.fn() };
    service = new LoginLockoutService(
      repository as unknown as Repository<User>,
    );
  });

  it("refuses while locked and allows once the lock has passed", () => {
    expect(() =>
      service.assertNotLocked({
        loginLockedUntil: new Date(Date.now() + 60_000),
      }),
    ).toThrow(AccountLockedException);
    expect(() =>
      service.assertNotLocked({ loginLockedUntil: new Date(Date.now() - 1) }),
    ).not.toThrow();
    expect(() =>
      service.assertNotLocked({ loginLockedUntil: null }),
    ).not.toThrow();
  });

  it("increments without locking below the threshold", async () => {
    repository.query.mockResolvedValue([[{ failedLoginAttempts: 3 }], 1]);

    await service.recordFailure("user-1");

    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('"failedLoginAttempts" + 1'),
      ["user-1"],
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("locks the account at the threshold", async () => {
    repository.query.mockResolvedValue([
      { failedLoginAttempts: LOGIN_LOCKOUT.MAX_FAILED_ATTEMPTS },
    ]);

    await service.recordFailure("user-1");

    const [, update] = repository.update.mock.calls[0];
    const lockMs = update.loginLockedUntil.getTime() - Date.now();
    expect(lockMs).toBeGreaterThan(LOGIN_LOCKOUT.BASE_LOCK_MS - 1000);
    expect(lockMs).toBeLessThanOrEqual(LOGIN_LOCKOUT.BASE_LOCK_MS);
  });

  it("clears the count on success only when there is something to clear", async () => {
    await service.recordSuccess({
      id: "u",
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    });
    expect(repository.update).not.toHaveBeenCalled();

    await service.recordSuccess({
      id: "u",
      failedLoginAttempts: 4,
      loginLockedUntil: null,
    });
    expect(repository.update).toHaveBeenCalledWith("u", {
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    });
  });

  it("locks unknown addresses after the same number of attempts", () => {
    for (let i = 0; i < LOGIN_LOCKOUT.MAX_FAILED_ATTEMPTS; i++) {
      service.recordUnknownEmailAttempt("hash-a");
    }
    expect(() => service.recordUnknownEmailAttempt("hash-a")).toThrow(
      AccountLockedException,
    );
    expect(() => service.recordUnknownEmailAttempt("hash-b")).not.toThrow();
  });
});

describe("loginThrottleLimit", () => {
  const original = process.env.LOGIN_THROTTLE_LIMIT;
  afterEach(() => {
    process.env.LOGIN_THROTTLE_LIMIT = original;
  });

  it("uses LOGIN_THROTTLE_LIMIT when it is a positive integer", () => {
    process.env.LOGIN_THROTTLE_LIMIT = "500";
    expect(loginThrottleLimit()).toBe(500);
    process.env.LOGIN_THROTTLE_LIMIT = "nope";
    expect(loginThrottleLimit()).toBe(20);
  });
});
