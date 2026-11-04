import { GOOGLE_PERMISSION_GROUP } from "../constants/google-oauth-scopes";
import {
  buildGooglePermissionGrantUrl,
  buildGrantReturnUrl,
  DEFAULT_GRANT_RETURN_PATH,
  GOOGLE_PERMISSION_RESULT,
  sanitizeReturnPath,
} from "./google-permission-grant";
import { parseSignedOAuthState } from "./oauth-state.util";

const FRONTEND_URL = "https://app.bearlymail.test";

describe("sanitizeReturnPath", () => {
  it("keeps an in-app path with its query", () => {
    expect(sanitizeReturnPath("/crm/contacts?tab=all")).toBe(
      "/crm/contacts?tab=all",
    );
  });

  it.each([
    ["an absolute URL", "https://evil.test/phish"],
    ["a protocol-relative URL", "//evil.test"],
    ["a backslash trick", "/\\evil.test"],
    ["a tab that hides a second slash", "/\t/evil.test"],
    ["a newline that hides a second slash", "/\n/evil.test"],
    ["a carriage return that hides a second slash", "/\r/evil.test"],
    ["a relative path", "inbox"],
    ["a non-string", 42],
    ["nothing", undefined],
    ["an over-long path", `/${"a".repeat(600)}`],
  ])("falls back to the inbox for %s", (_label, rawPath) => {
    expect(sanitizeReturnPath(rawPath)).toBe(DEFAULT_GRANT_RETURN_PATH);
  });
});

describe("buildGooglePermissionGrantUrl", () => {
  const originalEnv = { ...process.env };
  beforeAll(() => {
    process.env.JWT_SECRET = "unit-test-secret-1234567890-strong-32";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_REDIRECT_URI = "https://api.test/auth/google/callback";
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  const grantUrl = (permission = GOOGLE_PERMISSION_GROUP.CONTACTS) =>
    new URL(
      buildGooglePermissionGrantUrl({
        userId: "user-1",
        email: "dana@example.com",
        permission,
        returnTo: "//evil.test",
      }),
    );

  it("asks only for the requested group, on top of what was granted", () => {
    const url = grantUrl();
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "https://www.googleapis.com/auth/contacts.readonly",
      "https://www.googleapis.com/auth/contacts.other.readonly",
    ]);
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("login_hint")).toBe("dana@example.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.test/auth/google/callback",
    );
  });

  it("signs the user, permission and a safe return path into the state", () => {
    const state = parseSignedOAuthState(
      grantUrl(GOOGLE_PERMISSION_GROUP.CALENDAR).searchParams.get(
        "state",
      ) as string,
    );
    expect(state).toEqual({
      action: "grant_google_permission",
      userId: "user-1",
      permission: GOOGLE_PERMISSION_GROUP.CALENDAR,
      returnTo: DEFAULT_GRANT_RETURN_PATH,
    });
  });
});

describe("buildGrantReturnUrl", () => {
  it("returns to the requested page tagged with the outcome", () => {
    expect(
      buildGrantReturnUrl(
        FRONTEND_URL,
        "/crm/contacts?view=all",
        GOOGLE_PERMISSION_RESULT.DECLINED,
      ),
    ).toBe(`${FRONTEND_URL}/crm/contacts?view=all&googlePermission=declined`);
  });

  it("never leaves the app", () => {
    expect(
      buildGrantReturnUrl(
        FRONTEND_URL,
        "//evil.test",
        GOOGLE_PERMISSION_RESULT.GRANTED,
      ),
    ).toBe(`${FRONTEND_URL}/inbox?googlePermission=granted`);
  });
});
