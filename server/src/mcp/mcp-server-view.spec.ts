import {
  MCP_AUTH_TYPES,
  MCP_SERVER_PURPOSES,
  MCPServerConfig,
} from "../database/entities/mcp-server-config.entity";
import { redactServerUrl, toMCPServerView } from "./mcp-server-view";

const URL_KEY = "fake0000url0000key";
const SECRET_URL = `https://example.zohomcp.com/mcp/${URL_KEY}/message?key=abc`;

const buildConfig = (overrides: Partial<MCPServerConfig> = {}) =>
  ({
    id: "server-1",
    userId: "user-1",
    name: "Zoho Bigin",
    serverUrl: SECRET_URL,
    apiKey: "fake-api-key",
    authType: MCP_AUTH_TYPES.BEARER,
    accessToken: "fake-access-token",
    refreshToken: "fake-refresh-token",
    oauthClientSecret: "fake-client-secret",
    oauthCodeVerifier: "fake-verifier",
    oauthAuthState: "fake-state",
    purpose: MCP_SERVER_PURPOSES.SENDER_CONTEXT,
    enabled: true,
    cachedTools: null,
    toolsCachedAt: null,
    createdAt: new Date("2026-11-11T00:00:00Z"),
    ...overrides,
  }) as MCPServerConfig;

describe("redactServerUrl", () => {
  it("keeps only the origin", () => {
    expect(redactServerUrl(SECRET_URL)).toBe("https://example.zohomcp.com/…");
  });

  it("never echoes an unparseable value", () => {
    expect(redactServerUrl(`not a url ${URL_KEY}`)).toBe("…");
  });
});

describe("toMCPServerView", () => {
  it("contains no credential or URL path anywhere in the payload", () => {
    const serialized = JSON.stringify(toMCPServerView(buildConfig()));

    for (const secret of [
      URL_KEY,
      "fake-api-key",
      "fake-access-token",
      "fake-refresh-token",
      "fake-client-secret",
      "fake-verifier",
      "fake-state",
      "user-1",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("flags an OAuth connection without tokens as needing sign-in", () => {
    const view = toMCPServerView(
      buildConfig({
        authType: MCP_AUTH_TYPES.OAUTH,
        accessToken: null,
        refreshToken: null,
      }),
    );

    expect(view.needsAuthorization).toBe(true);
  });

  it("does not flag an authorized OAuth connection", () => {
    const view = toMCPServerView(
      buildConfig({ authType: MCP_AUTH_TYPES.OAUTH }),
    );

    expect(view.needsAuthorization).toBe(false);
    expect(view.hasApiKey).toBe(true);
  });
});
