import { Logger } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { User } from "../../database/entities/user.entity";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import { SyncHistoryService } from "../sync-history.service";
import { GmailProvider } from "./gmail.provider";
import { GmailSyncService } from "./gmail-sync.service";

const USER_ID = "user-123";
const ORIGINAL_REFRESH_TOKEN = "refresh-token-original";
const SIX_MINUTES_MS = 6 * 60 * 1000;

// Real Gmail "Request had insufficient authentication scopes" 403 shape.
const insufficientScopeError = Object.assign(
  new Error("Request had insufficient authentication scopes."),
  {
    code: 403,
    errors: [{ reason: "insufficientPermissions" }],
    response: { status: 403 },
  },
);

const unauthorizedError = Object.assign(new Error("Invalid Credentials"), {
  code: 401,
  response: { status: 401 },
});

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: "someone@example.com",
    googleCalendarAccessToken: "access-token",
    googleCalendarRefreshToken: ORIGINAL_REFRESH_TOKEN,
    needsRelogin: false,
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

describe("GmailSyncService.handleSyncError — relogin flagging", () => {
  let usersService: {
    findOneWithTokens: jest.Mock;
    markNeedsRelogin: jest.Mock;
  };
  let service: GmailSyncService;

  function givenCurrentUser(user: User): void {
    usersService.findOneWithTokens.mockResolvedValue(user);
  }

  beforeEach(() => {
    usersService = {
      findOneWithTokens: jest.fn(),
      markNeedsRelogin: jest.fn().mockResolvedValue(undefined),
    };
    service = new GmailSyncService(
      usersService as unknown as UsersService,
      {} as EmailsService,
      {} as ScanEmailService,
      {} as PgBoss,
      {} as SyncHistoryService,
      {} as GmailProvider,
    );
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("flags an insufficient-scope 403 immediately, even inside the grace period", async () => {
    const user = buildUser({ updatedAt: new Date() });
    givenCurrentUser(user);

    await expect(
      service.handleSyncError(USER_ID, user, insufficientScopeError),
    ).rejects.toBe(insufficientScopeError);

    expect(usersService.markNeedsRelogin).toHaveBeenCalledWith(
      USER_ID,
      "gmail_insufficient_scope",
      { bypassGracePeriod: true },
    );
  });

  it("does NOT flag a transient auth error inside the grace period", async () => {
    const user = buildUser({ updatedAt: new Date() });
    givenCurrentUser(user);

    await expect(
      service.handleSyncError(USER_ID, user, unauthorizedError),
    ).rejects.toBe(unauthorizedError);

    expect(usersService.markNeedsRelogin).not.toHaveBeenCalled();
  });

  it("still flags a generic auth error outside the grace period (unchanged behaviour)", async () => {
    const user = buildUser({
      updatedAt: new Date(Date.now() - SIX_MINUTES_MS),
    });
    givenCurrentUser(user);

    await expect(
      service.handleSyncError(USER_ID, user, unauthorizedError),
    ).rejects.toBe(unauthorizedError);

    expect(usersService.markNeedsRelogin).toHaveBeenCalledWith(
      USER_ID,
      "gmail_sync_auth_error",
      { bypassGracePeriod: false },
    );
  });

  it("does NOT bypass the grace period when the user reconnected mid-sync (new grant)", async () => {
    const userAtSyncStart = buildUser();
    givenCurrentUser(
      buildUser({
        googleCalendarRefreshToken: "refresh-token-after-reconsent",
        updatedAt: new Date(),
      }),
    );

    await expect(
      service.handleSyncError(USER_ID, userAtSyncStart, insufficientScopeError),
    ).rejects.toBe(insufficientScopeError);

    expect(usersService.markNeedsRelogin).not.toHaveBeenCalled();
  });

  it("does not flag non-auth errors", async () => {
    const user = buildUser({
      updatedAt: new Date(Date.now() - SIX_MINUTES_MS),
    });
    const networkError = new Error("socket hang up");

    await expect(
      service.handleSyncError(USER_ID, user, networkError),
    ).rejects.toBe(networkError);

    expect(usersService.findOneWithTokens).not.toHaveBeenCalled();
    expect(usersService.markNeedsRelogin).not.toHaveBeenCalled();
  });
});
