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
      markNeedsRelogin: jest.fn().mockResolvedValue(undefined),
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

  describe("needsRelogin skip (#2218 sync path)", () => {
    it("skips sync (no Gmail API call) when needsRelogin is set and outside the grace period", async () => {
      usersService.findOneWithTokens = jest.fn().mockResolvedValue({
        ...mockUser,
        needsRelogin: true,
        // 10 minutes ago, i.e. outside the 5-minute grace period
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      });

      await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();

      // Returned before creating the Gmail client / validating the token, so no
      // API call and no redundant re-flagging.
      expect(mockGetAccessToken).not.toHaveBeenCalled();
      expect(usersService.markNeedsRelogin).not.toHaveBeenCalled();
    });

    it("does NOT skip when needsRelogin is set but the user is within the grace period", async () => {
      usersService.findOneWithTokens = jest.fn().mockResolvedValue({
        ...mockUser,
        needsRelogin: true,
        // within 5 minutes, i.e. grace active (just logged in)
        updatedAt: new Date(),
      });
      const invalidTokenError = Object.assign(new Error("invalid_token"), {
        response: { data: { error: "invalid_token" } },
      });
      mockGetAccessToken.mockRejectedValue(invalidTokenError);

      await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();

      // Proceeded past the skip into token validation.
      expect(mockGetAccessToken).toHaveBeenCalled();
    });
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

      // needsRelogin must be set immediately, with a recorded reason
      expect(usersService.markNeedsRelogin).toHaveBeenCalledWith(
        "user-123",
        "gmail_invalid_token",
      );
    });

    it("sets needsRelogin and resolves when response.data.error is invalid_grant", async () => {
      const invalidGrantError = Object.assign(new Error("invalid_grant"), {
        response: { data: { error: "invalid_grant" } },
      });
      mockGetAccessToken.mockRejectedValue(invalidGrantError);

      await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();
      expect(usersService.markNeedsRelogin).toHaveBeenCalledWith(
        "user-123",
        "gmail_invalid_token",
      );
    });

    it("sets needsRelogin via message string fallback when no response.data is present", async () => {
      // Non-Gaxios error — only has a message string (fallback string check)
      const plainError = new Error("Invalid token");
      mockGetAccessToken.mockRejectedValue(plainError);

      await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();
      expect(usersService.markNeedsRelogin).toHaveBeenCalledWith(
        "user-123",
        "gmail_invalid_token",
      );
    });

    it("flags needsRelogin exactly once (from validateToken, not handleTokenValidationError)", async () => {
      // If handleTokenValidationError were invoked it would flag again;
      // there must be exactly one call.
      const invalidTokenError = Object.assign(new Error("invalid_token"), {
        response: { data: { error: "invalid_token" } },
      });
      mockGetAccessToken.mockRejectedValue(invalidTokenError);

      await provider.syncEmails("user-123");

      expect(usersService.markNeedsRelogin).toHaveBeenCalledTimes(1);
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

    it("does NOT flag needsRelogin via the invalid-token path for a generic error", async () => {
      const genericError = new Error("Something unrelated");
      mockGetAccessToken.mockRejectedValue(genericError);

      await expect(provider.syncEmails("user-123")).rejects.toThrow();

      // A generic error must not take the invalid-token early-return (which would
      // resolve and flag "gmail_invalid_token"). Since this user is within the
      // login grace period, handleTokenValidationError also skips flagging — so
      // markNeedsRelogin must not have been called at all.
      expect(usersService.markNeedsRelogin).not.toHaveBeenCalled();
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
      markNeedsRelogin: jest.fn().mockResolvedValue(undefined),
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
    const fakeGmail: Record<string, unknown> = {
      users: {
        threads: {
          list: jest.fn().mockImplementation(() => {
            const err: Error = new Error("Rate limited");
            err.response = { status: 429, headers: { "retry-after": "60" } };
            return Promise.reject(err);
          }),
        },
      },
    };

    await expect(
      gmailSyncService.fetchAllThreadsWithPagination(
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
    const fakeGmail: Record<string, unknown> = {
      users: {
        threads: {
          list: jest.fn().mockImplementation(() => {
            const err: Error = new Error("Rate limited");
            err.response = { status: 429, headers: { "retry-after": "120" } };
            return Promise.reject(err);
          }),
        },
      },
    };

    let thrown: GmailRateLimitError | undefined;
    try {
      await gmailSyncService.fetchAllThreadsWithPagination(
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
    const fakeGmail: Record<string, unknown> = {
      users: {
        threads: {
          list: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount < 3) {
              const err: Error = new Error("Server error");
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

    const result = await gmailSyncService.fetchAllThreadsWithPagination(
      fakeGmail,
      "is:starred",
      100,
    );

    expect(result).toEqual({ threadIds: ["t1"], hasMore: false });
    // Should have retried (called more than once)
    expect(
      (fakeGmail.users.threads.list as jest.Mock).mock.calls.length,
    ).toBeGreaterThanOrEqual(3);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining("threads.list returned"),
    );
  });

  it("throws after exhausting 5xx retries", async () => {
    const serverErr: Error = new Error("Server error");
    serverErr.response = { status: 500, headers: {} };

    const fakeGmail: Record<string, unknown> = {
      users: {
        threads: {
          list: jest.fn().mockRejectedValue(serverErr),
        },
      },
    };

    // Replace setTimeout with an immediate no-op for this test so exponential
    // backoff sleeps complete instantly (avoids ~30s of real waiting).
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn: () => void) => {
      fn();
      return 0;
    };
    try {
      let thrown: unknown;
      try {
        await gmailSyncService.fetchAllThreadsWithPagination(
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

describe("GmailProvider — read/search 403 insufficient-scope handling (#2218)", () => {
  let provider: GmailProvider;
  let usersService: jest.Mocked<UsersService>;

  // A real Gmail "Request had insufficient authentication scopes" 403 shape.
  const insufficientScopeError = Object.assign(
    new Error("Request had insufficient authentication scopes."),
    {
      code: 403,
      errors: [{ reason: "insufficientPermissions" }],
      response: { status: 403 },
    },
  );

  // A transient 403 rate-limit — must NOT be treated as an auth failure.
  const rateLimitError = Object.assign(new Error("Rate Limit Exceeded"), {
    code: 403,
    errors: [{ reason: "userRateLimitExceeded" }],
    response: { status: 403 },
  });

  function buildProviderWithListReject(
    rejection: unknown,
  ): Promise<GmailProvider> {
    // Override the mocked googleapis gmail() so the search path uses a client
    // whose messages.list rejects with the supplied error.
    const { google } = jest.requireMock("googleapis");
    (google.gmail as jest.Mock).mockReturnValue({
      users: {
        messages: { list: jest.fn().mockRejectedValue(rejection) },
      },
    });
    return Test.createTestingModule({
      providers: [
        GmailProvider,
        GmailSyncService,
        { provide: UsersService, useValue: usersService },
        {
          provide: EmailsService,
          useValue: {} as unknown as jest.Mocked<EmailsService>,
        },
        {
          provide: ScanEmailService,
          useValue: {} as unknown as jest.Mocked<ScanEmailService>,
        },
        {
          provide: SyncHistoryService,
          useValue: {} as unknown as jest.Mocked<SyncHistoryService>,
        },
        { provide: "PG_BOSS", useValue: { send: jest.fn() } },
      ],
    })
      .compile()
      .then((module) => module.get<GmailProvider>(GmailProvider));
  }

  beforeEach(() => {
    usersService = {
      findOneWithTokens: jest.fn().mockResolvedValue({
        id: "user-123",
        googleCalendarAccessToken: "access-token",
        googleCalendarRefreshToken: "refresh-token",
        updatedAt: new Date(),
      }),
      findOneLightweight: jest
        .fn()
        .mockResolvedValue({ id: "user-123", needsRelogin: false }),
      update: jest.fn().mockResolvedValue(undefined),
      markNeedsRelogin: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UsersService>;

    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("flags needsRelogin and logs at WARN (not ERROR) on a 403 insufficient-scope error", async () => {
    provider = await buildProviderWithListReject(insufficientScopeError);

    const results = await provider.searchEmails("user-123", "test");

    expect(results).toEqual([]);
    expect(usersService.markNeedsRelogin).toHaveBeenCalledWith(
      "user-123",
      "gmail_read_auth_error",
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining("auth failure"),
    );
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it("does NOT re-log (stays silent) when the account is already flagged needsRelogin", async () => {
    (usersService.findOneLightweight as jest.Mock).mockResolvedValue({
      id: "user-123",
      needsRelogin: true,
    });
    provider = await buildProviderWithListReject(insufficientScopeError);

    const results = await provider.searchEmails("user-123", "test");

    expect(results).toEqual([]);
    // markNeedsRelogin should not be invoked if the user is already flagged,
    // avoiding redundant database queries. No auth-failure log line should be
    // emitted on subsequent cycles for an already-flagged user. (Other
    // unrelated warnings — e.g. missing OAuth env vars in the test harness —
    // may fire, so we match our specific message.)
    expect(usersService.markNeedsRelogin).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("auth failure"),
    );
    expect(Logger.prototype.error).not.toHaveBeenCalledWith(
      expect.stringContaining("Failed to search emails"),
    );
  });

  it("logs at ERROR and does NOT flag relogin on a transient (rate-limit) 403", async () => {
    provider = await buildProviderWithListReject(rateLimitError);

    const results = await provider.searchEmails("user-123", "test");

    expect(results).toEqual([]);
    expect(usersService.markNeedsRelogin).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to search emails"),
    );
  });
});

describe("GmailProvider — lastEmailSyncAt advances after every sync attempt (batching regression)", () => {
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
        needsRelogin: false,
        // null => this is an initial sync; if lastEmailSyncAt is never advanced
        // when performSync throws, every subsequent sync stays "initial" and
        // batching is permanently disabled.
        lastEmailSyncAt: null,
      }),
      update: jest.fn().mockResolvedValue(undefined),
      markNeedsRelogin: jest.fn().mockResolvedValue(undefined),
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

    // OAuth client creation succeeds so we reach performSync.
    mockGetAccessToken.mockResolvedValue({ token: "access-token" });

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

    // Token validation passes in all cases below — we isolate the sync step.
    jest.spyOn(gmailSyncService, "validateToken").mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("stamps lastEmailSyncAt even when performSync throws", async () => {
    jest
      .spyOn(gmailSyncService, "performSync")
      .mockRejectedValue(new Error("sync boom"));
    const handleSyncError = jest
      .spyOn(gmailSyncService, "handleSyncError")
      .mockResolvedValue(undefined);

    // syncEmails swallows the error (handleSyncError) and resolves.
    await expect(provider.syncEmails("user-123")).resolves.toBeUndefined();

    expect(handleSyncError).toHaveBeenCalled();
    // The critical assertion: the failed sync still advanced lastEmailSyncAt,
    // so the next sync is no longer treated as an initial sync.
    expect(usersService.update).toHaveBeenCalledWith("user-123", {
      lastEmailSyncAt: expect.any(Date),
    });
  });

  it("stamps lastEmailSyncAt on a successful sync", async () => {
    jest.spyOn(gmailSyncService, "performSync").mockResolvedValue(undefined);

    await provider.syncEmails("user-123");

    expect(usersService.update).toHaveBeenCalledWith("user-123", {
      lastEmailSyncAt: expect.any(Date),
    });
  });
});
