import { biginRecordUrl, zohoRegionOf } from "./bigin-record-url";
import { BIGIN_MODULES } from "./bigin-sender-context.constants";

const RECORD_ID = "2034020000000123456";

const viaOAuth = (issuer: string) => ({
  serverUrl: "https://mcp.example/never-used",
  oauthMetadata: {
    issuer,
    authorizationEndpoint: `${issuer}/oauth/v2/auth`,
    tokenEndpoint: `${issuer}/oauth/v2/token`,
  },
});

const viaServerUrl = (serverUrl: string) => ({
  serverUrl,
  oauthMetadata: null,
});

describe("biginRecordUrl", () => {
  it.each([
    ["US", "https://accounts.zoho.com", "bigin.zoho.com"],
    ["EU", "https://accounts.zoho.eu", "bigin.zoho.eu"],
    ["AU", "https://accounts.zoho.com.au", "bigin.zoho.com.au"],
    ["IN", "https://accounts.zoho.in", "bigin.zoho.in"],
    ["JP", "https://accounts.zoho.jp", "bigin.zoho.jp"],
  ])("links %s accounts (OAuth issuer %s) to %s", (_dc, issuer, host) => {
    expect(
      biginRecordUrl(viaOAuth(issuer), BIGIN_MODULES.CONTACTS, RECORD_ID),
    ).toBe(`https://${host}/bigin/Home#/contacts/${RECORD_ID}`);
  });

  it.each([
    ["https://acme-123.zohomcp.eu/mcp/key/message", "eu"],
    ["https://mcp.zoho.in/mcp/key/message", "in"],
    ["https://acme-123.zohomcp.com/mcp/key/message", "com"],
    ["https://acme-123.zohomcp.com.au/mcp/key/message", "com.au"],
  ])("falls back to the MCP URL's region (%s → %s)", (serverUrl, region) => {
    expect(zohoRegionOf(viaServerUrl(serverUrl))).toBe(region);
  });

  it("prefers the OAuth issuer over the MCP URL", () => {
    expect(
      zohoRegionOf({
        ...viaOAuth("https://accounts.zoho.eu"),
        serverUrl: "https://acme-123.zohomcp.com/mcp/key/message",
      }),
    ).toBe("eu");
  });

  it("links companies under the accounts route", () => {
    expect(
      biginRecordUrl(
        viaServerUrl("https://mcp.zoho.com/x"),
        BIGIN_MODULES.ACCOUNTS,
        RECORD_ID,
      ),
    ).toBe(`https://bigin.zoho.com/bigin/Home#/accounts/${RECORD_ID}`);
  });

  it.each([
    "https://mcp.example.com/mcp",
    "https://zoho.com.evil.example/mcp",
    "not a url",
  ])("gives no link when the region can't be told (%s)", (serverUrl) => {
    expect(
      biginRecordUrl(
        viaServerUrl(serverUrl),
        BIGIN_MODULES.CONTACTS,
        RECORD_ID,
      ),
    ).toBeNull();
  });
});
