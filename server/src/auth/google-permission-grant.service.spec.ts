import { AUTH_ACTION_TYPES } from "../constants/domain-types";
import {
  GOOGLE_PERMISSION_GROUP,
  GOOGLE_SIGN_IN_SCOPES,
  MISSING_GMAIL_PERMISSION_MESSAGE,
  scopesForGooglePermissionGroup,
} from "../constants/google-oauth-scopes";
import { JOB_NAMES } from "../constants/job-names";
import {
  GOOGLE_PERMISSION_RESULT,
  GOOGLE_PERMISSION_RESULT_PARAM,
} from "./google-permission-grant";
import { GooglePermissionGrantService } from "./google-permission-grant.service";
import {
  createConnectState,
  createGooglePermissionState,
} from "./oauth-state.util";

const USER_ID = "user-1";
const GOOGLE_ID = "google-1";

const grantOf = (...groups: Array<"calendar" | "contacts">) =>
  [
    ...GOOGLE_SIGN_IN_SCOPES,
    ...groups.flatMap((group) => scopesForGooglePermissionGroup(group)),
  ].join(" ");

const FRONTEND_URL = "https://app.bearlymail.test";

const resultOf = (returnUrl: string) =>
  new URL(returnUrl).searchParams.get(GOOGLE_PERMISSION_RESULT_PARAM);

const stateFor = (permission: string) => ({
  action: AUTH_ACTION_TYPES.GRANT_GOOGLE_PERMISSION,
  userId: USER_ID,
  permission,
  returnTo: "/inbox",
});

describe("GooglePermissionGrantService", () => {
  const googleAccountsService = {
    findAllByUser: jest.fn(),
    updateTokens: jest.fn(),
  };
  const userEncryptionService = {
    withUserKey: (_userId: string, task: () => Promise<unknown>) => task(),
  };
  const boss = { send: jest.fn().mockResolvedValue("job-1") };
  const service = new GooglePermissionGrantService(
    googleAccountsService as never,
    userEncryptionService as never,
    boss as never,
  );

  const callbackUser = (grantedScopes: string) => ({
    id: USER_ID,
    googleGrantedScopes: grantedScopes,
    googleId: GOOGLE_ID,
    googleAccessToken: "new-access",
    googleRefreshToken: "new-refresh",
  });

  beforeEach(() => {
    jest.clearAllMocks();
    googleAccountsService.findAllByUser.mockResolvedValue([
      { id: "account-1", googleId: GOOGLE_ID },
    ]);
  });

  it("imports contacts once the contacts grant lands", async () => {
    const result = await service.completeGrant(
      stateFor(GOOGLE_PERMISSION_GROUP.CONTACTS),
      callbackUser(grantOf("contacts")),
      FRONTEND_URL,
    );

    expect(resultOf(result)).toBe(GOOGLE_PERMISSION_RESULT.GRANTED);
    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.SYNC_CONTACTS,
      { userId: USER_ID },
      { singletonKey: `sync-contacts-${USER_ID}` },
    );
  });

  it("moves the new tokens onto the linked Google account", async () => {
    await service.completeGrant(
      stateFor(GOOGLE_PERMISSION_GROUP.CALENDAR),
      callbackUser(grantOf("calendar")),
      FRONTEND_URL,
    );

    expect(googleAccountsService.updateTokens).toHaveBeenCalledWith(
      "account-1",
      USER_ID,
      "new-access",
      "new-refresh",
    );
    expect(boss.send).not.toHaveBeenCalled();
  });

  it("reports a declined grant when the group's boxes were left unticked", async () => {
    const result = await service.completeGrant(
      stateFor(GOOGLE_PERMISSION_GROUP.CALENDAR),
      callbackUser(grantOf()),
      FRONTEND_URL,
    );

    expect(resultOf(result)).toBe(GOOGLE_PERMISSION_RESULT.DECLINED);
    expect(googleAccountsService.updateTokens).not.toHaveBeenCalled();
  });

  it("refuses a grant completed with a different Google account", async () => {
    const result = await service.completeGrant(
      stateFor(GOOGLE_PERMISSION_GROUP.CONTACTS),
      { ...callbackUser(grantOf("contacts")), id: "someone-else" },
      FRONTEND_URL,
    );

    expect(resultOf(result)).toBe(GOOGLE_PERMISSION_RESULT.WRONG_ACCOUNT);
    expect(boss.send).not.toHaveBeenCalled();
    expect(googleAccountsService.updateTokens).not.toHaveBeenCalled();
  });

  it("treats a permission it doesn't grant incrementally as declined", async () => {
    const result = await service.completeGrant(
      stateFor(GOOGLE_PERMISSION_GROUP.GMAIL),
      callbackUser(grantOf("calendar", "contacts")),
      FRONTEND_URL,
    );

    expect(resultOf(result)).toBe(GOOGLE_PERMISSION_RESULT.DECLINED);
  });
});

describe("GooglePermissionGrantService.getCallbackRedirect", () => {
  const originalSecret = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = "unit-test-secret-1234567890-strong-32";
  });
  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  const boss = { send: jest.fn().mockResolvedValue("job-1") };
  const service = new GooglePermissionGrantService(
    {} as never,
    {} as never,
    boss as never,
  );
  const failed = (message: string) => ({
    authError: new Error(message),
    user: { authFailed: true },
  });
  const grantState = () =>
    createGooglePermissionState(USER_ID, "calendar", "/email/abc");

  it("returns a cancelled grant to the page that asked, as declined", async () => {
    const url = await service.getCallbackRedirect(
      grantState(),
      failed("denied"),
      FRONTEND_URL,
    );

    expect(url).toBe(
      `${FRONTEND_URL}/email/abc?${GOOGLE_PERMISSION_RESULT_PARAM}=declined`,
    );
  });

  it("reports an account without Gmail access as the wrong account", async () => {
    const url = await service.getCallbackRedirect(
      grantState(),
      failed(MISSING_GMAIL_PERMISSION_MESSAGE),
      FRONTEND_URL,
    );

    expect(resultOf(url as string)).toBe(
      GOOGLE_PERMISSION_RESULT.WRONG_ACCOUNT,
    );
  });

  it("finishes a grant Google completed", async () => {
    const url = await service.getCallbackRedirect(
      grantState(),
      { user: { id: "someone-else" } },
      FRONTEND_URL,
    );

    expect(resultOf(url as string)).toBe(
      GOOGLE_PERMISSION_RESULT.WRONG_ACCOUNT,
    );
  });

  it.each([
    ["a sign-in with no state", () => undefined],
    ["a connect flow", () => createConnectState(USER_ID)],
    ["a tampered state", () => `${grantState()}x`],
  ])("leaves %s to AuthController", async (_label, buildState) => {
    await expect(
      service.getCallbackRedirect(buildState(), failed("denied"), FRONTEND_URL),
    ).resolves.toBeNull();
  });
});

describe("GooglePermissionGrantService return URL", () => {
  it("sends the browser back to the page that asked", async () => {
    const service = new GooglePermissionGrantService(
      { findAllByUser: jest.fn().mockResolvedValue([]) } as never,
      {
        withUserKey: (_id: string, task: () => Promise<unknown>) => task(),
      } as never,
      { send: jest.fn().mockResolvedValue("job") } as never,
    );
    const url = await service.completeGrant(
      { ...stateFor(GOOGLE_PERMISSION_GROUP.CALENDAR), returnTo: "/email/42" },
      {
        id: USER_ID,
        googleGrantedScopes: grantOf("calendar"),
      },
      FRONTEND_URL,
    );
    expect(url).toBe(`${FRONTEND_URL}/email/42?googlePermission=granted`);
  });
});
