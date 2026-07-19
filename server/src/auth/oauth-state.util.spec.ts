import { createHmac } from "crypto";

import { createConnectState, parseSignedOAuthState } from "./oauth-state.util";

describe("oauth-state.util", () => {
  const OLD_SECRET = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = "unit-test-secret-1234567890-strong-32";
  });

  afterAll(() => {
    process.env.JWT_SECRET = OLD_SECRET;
  });

  it("round-trips a signed connect state", () => {
    const state = createConnectState("user-123");
    const parsed = parseSignedOAuthState(state);
    expect(parsed).toEqual({ action: "connect", userId: "user-123" });
  });

  it("rejects an unsigned (plain base64 JSON) state", () => {
    const forged = Buffer.from(
      JSON.stringify({ userId: "victim", action: "connect", iat: Date.now() }),
    ).toString("base64url");
    expect(parseSignedOAuthState(forged)).toBeNull();
  });

  it("rejects a state whose payload was tampered after signing", () => {
    const state = createConnectState("attacker");
    const [, sig] = state.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ userId: "victim", action: "connect", iat: Date.now() }),
    ).toString("base64url");
    expect(parseSignedOAuthState(`${tamperedBody}.${sig}`)).toBeNull();
  });

  it("rejects a state signed with a different secret", () => {
    const state = createConnectState("user-123");
    process.env.JWT_SECRET = "a-completely-different-secret-00000000";
    try {
      expect(parseSignedOAuthState(state)).toBeNull();
    } finally {
      process.env.JWT_SECRET = "unit-test-secret-1234567890-strong-32";
    }
  });

  it("rejects an expired state (older than the 1h TTL)", () => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const json = JSON.stringify({
      userId: "user-123",
      action: "connect",
      iat: Date.now() - twoHoursMs,
    });
    const body = Buffer.from(json).toString("base64url");
    const sig = createHmac("sha256", process.env.JWT_SECRET as string)
      .update(json)
      .digest("base64url");
    expect(parseSignedOAuthState(`${body}.${sig}`)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseSignedOAuthState("")).toBeNull();
    expect(parseSignedOAuthState("no-dot")).toBeNull();
    expect(parseSignedOAuthState("a.b.c")).toBeNull();
  });
});
