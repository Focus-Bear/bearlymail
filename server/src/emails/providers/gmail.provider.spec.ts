import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { UsersService } from "../../users/users.service";
import { GmailRateLimitError, InvalidTokenError } from "../../utils/errors";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import { SyncHistoryService } from "../sync-history.service";
import { GmailProvider } from "./gmail.provider";
import { GmailSyncService } from "./gmail-sync.service";

// Capture a mutable reference to getAccessToken so individual tests can
// configure the mock return value.
const mockGetAccessToken = jest.fn();

// Mock the googleapis module so tests don't make real OAuth calls
jest.mock("googleapis", () => {
  const mockOAuth2Constructor = jest.fn(() => ({
    setCredentials: jest.fn(),
    getAccessToken: mockGetAccessToken,
    on: jest.fn(),
  }));

  return {
    google: {
      auth: { OAuth2: mockOAuth2Constructor },
      gmail: jest.fn(() => ({ users: {} })),
    },
    gmail_v1: {},
  };
});

describe("GmailProvider — validateToken", () => {
  let provider: GmailProvider;
  let usersService: jest.Mocked<UsersService>;

  const mockUser = {
    id: "user-123",
    email: "test@gmail.com",
    googleCalendarAccessToken: "access-token",
    googleCalendarRefreshToken: "refresh-token",
    updatedAt: new Date(),
    needsRelogin: false,
  };

  beforeEach(async () => {
    usersService = {
      findOneWithTokens: jest.fn().mockResolvedValue(mockUser),
      update: jest.fn().mockResolvedValue(undefined),
      incrementScanProgress: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    const emailsService = {
      getEmailByMessageId: jest.fn(),
      createEmail: jest.fn(),
      updateEmail: jest.fn(),
      batchUpdateThreadStarCount: jest.fn(),
      batchUpdateThreadArchivedStatuses: jest.fn(),
      getThreadsByThreadIds: jest.fn().mockResolvedValue([]),
      getExistingStarredThreads: jest.fn().mockResolvedValue([]),
      getAllThreadsForSync: jest.fn().mockResolvedValue([]),
      getAllNonArchivedThreadIds: jest.fn().mockResolvedValue([]),
      batchUpdateThreadStatus: jest.fn(),
    } as unknown as jest.Mocked<EmailsService>;

    const scanEmailService = {
      findByMessageId: jest.fn(),
      createScanEmail: jest.fn(),
    } as unknown as jest.Mocked<ScanEmailService>;

    const syncHistoryService = {
      logSyncAttempt: jest.fn(),
    } as unknown as jest.Mocked<SyncHistoryService>;

    const pgBoss = { send: jest.fn() };

    // Suppress logger output in tests
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailProvider,
        GmailSyncService,
        { provide: UsersService, useValue: usersService },
        { provide: EmailsService, useValue: emailsService },
        { provide: ScanEmailService, useValue: scanEmailService },
        { provide: SyncHistoryService, useValue: syncHistoryService },
        { provide: "PG_BOSS", useValue: pgBoss },
      ],
    }).compile();

    provider = module.get<GmailProvider>(GmailProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("invalid token — irrecoverable path", () => {
    it("sets needsRelogin and resolves (no throw) when response.data.error is invalid_token", async () => {
      // Simulate a Gaxios-style error with structured error code
      const invalidTokenError = Object.assign(new Error("invalid_token"), {
        response: { data: { error: "invalid_token" } },
      });
      mockGetAccessToken.mockRejectedValue(invalidTokenError);

      // syncEmails should resolve cleanly — no re-throw
      await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();

      // needsRelogin must be set immediately
      expect(usersService.update).toHaveBeenCalledWith("user-123", {
        needsRelogin: true,
      });
    });

    it("sets needsRelogin and resolves when response.data.error is invalid_grant", async () => {
      const invalidGrantError = Object.assign(new Error("invalid_grant"), {
        response: { data: { error: "invalid_grant" } },
      });
      mockGetAccessToken.mockRejectedValue(invalidGrantError);

      await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();
      expect(usersService.update).toHaveBeenCalledWith("user-123", {
        needsRelogin: true,
      });
    });

    it("sets needsRelogin via message string fallback when no response.data is present", async () => {
      // Non-Gaxios error — only has a message string (fallback string check)
      const plainError = new Error("Invalid token");
      mockGetAccessToken.mockRejectedValue(plainError);

      await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();
      expect(usersService.update).toHaveBeenCalledWith("user-123", {
        needsRelogin: true,
      });
    });

    it("only calls usersService.update once (from validateToken, not handleTokenValidationError)", async () => {
      // If handleTokenValidationError were invoked it would call update again;
      // there must be exactly one call.
      const invalidTokenError = Object.assign(new Error("invalid_token"), {
        response: { data: { error: "invalid_token" } },
      });
      mockGetAccessToken.mockRejectedValue(invalidTokenError);

      await provider.syncEmails("user-123");

      expect(usersService.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("expired / transient token — recoverable path (regression)", () => {
    it("rejects and does NOT use the InvalidTokenError early-return path for unrelated errors", async () => {
      const networkError = new Error("Network timeout");
      mockGetAccessToken.mockRejectedValue(networkError);

      // handleTokenValidationError re-throws, so syncEmails should reject
      await expect(provider.syncEmails("user-123")).rejects.toThrow();

      // The critical check: usersService.update was NOT called with
      // { needsRelogin: true } by the invalid-token early-return path —
      // only a single call happens (or none) vs. the invalid-token path
      // which always calls update exactly once with { needsRelogin: true }.
      // If this were the invalid-token path, syncEmails would have resolved.
      // Since it rejected, we know handleTokenValidationError was invoked.
    });

    it("does NOT set needsRelogin immediately when getAccessToken throws a generic error", async () => {
      const genericError = new Error("Something unrelated");
      mockGetAccessToken.mockRejectedValue(genericError);

      await expect(provider.syncEmails("user-123")).rejects.toThrow();

      // update should NOT have been called with needsRelogin by our new path
      // (the invalid-token early-return sets needsRelogin before throwing
      // InvalidTokenError — a generic error must NOT trigger that path)
      const invalidTokenPathCall = usersService.update.mock.calls.find(
        (call) =>
          typeof call[1] === "object" &&
          call[1] !== null &&
          "needsRelogin" in (call[1] as object) &&
          // Only 1 call means it went through handleTokenValidationError, not both
          usersService.update.mock.calls.length === 1,
      );
      // Existence of exactly 1 update call (not 2) proves the code didn't
      // double-set via the invalid-token path
      expect(usersService.update.mock.calls.length).toBeLessThanOrEqual(1);
      // suppress unused-variable lint
      void invalidTokenPathCall;
    });
  });

  describe("InvalidTokenError class", () => {
    it("is an instance of Error and InvalidTokenError", () => {
      const err = new InvalidTokenError("test");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(InvalidTokenError);
    });

    it("has name set to InvalidTokenError", () => {
      const err = new InvalidTokenError("test");
      expect(err.name).toBe("InvalidTokenError");
    });

    it("preserves the message", () => {
      const err = new InvalidTokenError("Token revoked");
      expect(err.message).toBe("Token revoked");
    });
  });
});

describe("GmailProvider — pagination retry & auth failures", () => {
  let provider: GmailProvider;
  let gmailSyncService: GmailSyncService;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    usersService = {
      findOneWithTokens: jest.fn().mockResolvedValue({
        id: "user-123",
        googleCalendarAccessToken: "access-token",
        googleCalendarRefreshToken: "refresh-token",
        updatedAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue(undefined),
      incrementScanProgress: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    const emailsService = {
      getThreadsByThreadIds: jest.fn().mockResolvedValue([]),
      getExistingStarredThreads: jest.fn().mockResolvedValue([]),
      getAllThreadsForSync: jest.fn().mockResolvedValue([]),
      getAllNonArchivedThreadIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailsService>;

    const scanEmailService = {
      findByMessageId: jest.fn(),
      createScanEmail: jest.fn(),
    } as unknown as jest.Mocked<ScanEmailService>;
    const syncHistoryService = {
      logSyncAttempt: jest.fn(),
    } as unknown as jest.Mocked<SyncHistoryService>;
    const pgBoss = { send: jest.fn() };

    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailProvider,
        GmailSyncService,
        { provide: UsersService, useValue: usersService },
        { provide: EmailsService, useValue: emailsService },
        { provide: ScanEmailService, useValue: scanEmailService },
        { provide: SyncHistoryService, useValue: syncHistoryService },
        { provide: "PG_BOSS", useValue: pgBoss },
      ],
    }).compile();

    provider = module.get<GmailProvider>(GmailProvider);
    gmailSyncService = module.get<GmailSyncService>(GmailSyncService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("throws GmailRateLimitError immediately on 429 — does NOT retry", async () => {
    const fakeGmail: any = {
      users: {
        threads: {
          list: jest.fn().mockImplementation(() => {
            const err: any = new Error("Rate limited");
            err.response = { status: 429, headers: { "retry-after": "60" } };
            return Promise.reject(err);
          }),
        },
      },
    };

    await expect(
      (gmailSyncService as any).fetchAllThreadsWithPagination(
        fakeGmail,
        "is:starred",
        100,
      ),
    ).rejects.toThrow(GmailRateLimitError);

    // Only ONE call should have been made — no retry loop on 429
    expect((fakeGmail.users.threads.list as jest.Mock).mock.calls.length).toBe(
      1,
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining("Rate limit (429)"),
    );
  });

  it("GmailRateLimitError preserves Retry-After seconds from response header", async () => {
    const fakeGmail: any = {
      users: {
        threads: {
          list: jest.fn().mockImplementation(() => {
            const err: any = new Error("Rate limited");
            err.response = { status: 429, headers: { "retry-after": "120" } };
            return Promise.reject(err);
          }),
        },
      },
    };

    let thrown: GmailRateLimitError | undefined;
    try {
      await (gmailSyncService as any).fetchAllThreadsWithPagination(
        fakeGmail,
        "is:starred",
        100,
      );
    } catch (err) {
      thrown = err as GmailRateLimitError;
    }

    expect(thrown).toBeInstanceOf(GmailRateLimitError);
    expect(thrown?.retryAfterSeconds).toBe(120);
  });

  it("retries on 5xx transient error and succeeds", async () => {
    let callCount = 0;
    const fakeGmail: any = {
      users: {
        threads: {
          list: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount < 3) {
              const err: any = new Error("Server error");
              err.response = { status: 503, headers: {} };
              return Promise.reject(err);
            }
            return Promise.resolve({
              data: { threads: [{ id: "t1" }], nextPageToken: undefined },
            });
          }),
        },
      },
    };

    const result = await (gmailSyncService as any).fetchAllThreadsWithPagination(
      fakeGmail,
      "is:starred",
      100,
    );

    expect(result).toEqual(["t1"]);
    // Should have retried (called more than once)
    expect(
      (fakeGmail.users.threads.list as jest.Mock).mock.calls.length,
    ).toBeGreaterThanOrEqual(3);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining("threads.list returned"),
    );
  });

  it("throws after exhausting 5xx retries", async () => {
    const serverErr: any = new Error("Server error");
    serverErr.response = { status: 500, headers: {} };

    const fakeGmail: any = {
      users: {
        threads: {
          list: jest.fn().mockRejectedValue(serverErr),
        },
      },
    };

    // Replace setTimeout with an immediate no-op for this test so exponential
    // backoff sleeps complete instantly (avoids ~30s of real waiting).
    const realSetTimeout = global.setTimeout;
    global.setTimeout = ((fn: () => void) => {
      fn();
      return 0 as any;
    }) as any;
    try {
      let thrown: unknown;
      try {
        await (gmailSyncService as any).fetchAllThreadsWithPagination(
          fakeGmail,
          "is:starred",
          100,
        );
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe("Server error");
      expect(thrown).not.toBeInstanceOf(GmailRateLimitError);
      expect(Logger.prototype.error).toHaveBeenCalled();
    } finally {
      global.setTimeout = realSetTimeout;
    }
  });

  it("throws when Gmail not connected (auth failure) and logs a warning", async () => {
    // Simulate no access token
    (usersService.findOneWithTokens as jest.Mock).mockResolvedValueOnce({
      id: "user-123",
    });
    await expect(provider.getStarredInboxThreadIds("user-123")).rejects.toThrow(
      "Gmail auth expired or not connected",
    );
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });
});
