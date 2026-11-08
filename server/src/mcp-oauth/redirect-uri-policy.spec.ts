import {
  isLoopbackRedirectUri,
  isRegistrableRedirectUri,
  matchesRegisteredRedirectUri,
  redirectUriHost,
} from "./redirect-uri-policy";

const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

describe("redirect URI policy", () => {
  it.each([
    [CLAUDE_CALLBACK, true],
    ["http://localhost/callback", true],
    ["http://127.0.0.1:3118/callback", true],
    ["http://[::1]:8080/cb", true],
    ["http://claude.ai/api/mcp/auth_callback", false],
    ["https://claude.ai/cb#fragment", false],
    ["https://user:pass@claude.ai/cb", false],
    ["javascript:alert(1)", false],
    ["not a url", false],
  ])("registrable(%s) = %s", (uri, expected) => {
    expect(isRegistrableRedirectUri(uri)).toBe(expected);
  });

  it("matches non-loopback URIs exactly", () => {
    expect(
      matchesRegisteredRedirectUri(CLAUDE_CALLBACK, [CLAUDE_CALLBACK]),
    ).toBe(true);
    expect(
      matchesRegisteredRedirectUri(`${CLAUDE_CALLBACK}/x`, [CLAUDE_CALLBACK]),
    ).toBe(false);
    expect(
      matchesRegisteredRedirectUri(
        "https://claude.ai:8443/api/mcp/auth_callback",
        [CLAUDE_CALLBACK],
      ),
    ).toBe(false);
  });

  it("matches loopback URIs on any port (Claude Code's ephemeral callback)", () => {
    const registered = [
      "http://localhost/callback",
      "http://127.0.0.1/callback",
    ];
    expect(
      matchesRegisteredRedirectUri(
        "http://localhost:3118/callback",
        registered,
      ),
    ).toBe(true);
    expect(
      matchesRegisteredRedirectUri(
        "http://127.0.0.1:52011/callback",
        registered,
      ),
    ).toBe(true);
    expect(
      matchesRegisteredRedirectUri("http://localhost:3118/other", registered),
    ).toBe(false);
    expect(
      matchesRegisteredRedirectUri("http://[::1]:3118/callback", registered),
    ).toBe(false);
  });

  it("identifies loopback redirects and their hosts", () => {
    expect(isLoopbackRedirectUri("http://localhost:1/cb")).toBe(true);
    expect(isLoopbackRedirectUri(CLAUDE_CALLBACK)).toBe(false);
    expect(redirectUriHost(CLAUDE_CALLBACK)).toBe("claude.ai");
  });
});
