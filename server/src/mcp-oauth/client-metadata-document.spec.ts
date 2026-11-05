import type { AddressInfo } from "net";
import { createServer } from "net";

import {
  ClientMetadataError,
  fetchClientMetadataJson,
  isClientMetadataDocumentUrl,
  validateClientMetadataDocument,
} from "./client-metadata-document";

const CLIENT_ID = "https://claude.ai/oauth/claude-code-client-metadata";
const DOCUMENT = {
  client_id: CLIENT_ID,
  client_name: "Claude Code",
  redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
  token_endpoint_auth_method: "none",
};

describe("isClientMetadataDocumentUrl", () => {
  it.each([
    [CLIENT_ID, true],
    ["https://claude.ai/", false],
    ["http://claude.ai/client.json", false],
    ["https://claude.ai/a/../client.json", false],
    ["bm_client_abc", false],
    ["https://127.0.0.1/client.json", false],
    ["https://10.0.0.5/client.json", false],
    ["https://169.254.169.254/latest/meta-data", false],
    ["https://[::1]/client.json", false],
    ["https://2130706433/client.json", false],
    ["https://0x7f.0.0.1/client.json", false],
  ])("%s → %s", (clientId, expected) => {
    expect(isClientMetadataDocumentUrl(clientId)).toBe(expected);
  });
});

describe("fetchClientMetadataJson", () => {
  it("never connects to a client_id that is an IP address", async () => {
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const { port } = server.address() as AddressInfo;

    await expect(
      fetchClientMetadataJson(`https://127.0.0.1:${port}/client.json`),
    ).rejects.toThrow("not a valid metadata URL");

    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(connections).toBe(0);
  });
});

describe("validateClientMetadataDocument", () => {
  it("accepts a well-formed public client document", () => {
    expect(validateClientMetadataDocument(CLIENT_ID, DOCUMENT)).toEqual({
      clientId: CLIENT_ID,
      clientName: "Claude Code",
      redirectUris: DOCUMENT.redirect_uris,
    });
  });

  it("falls back to the host when client_name is missing", () => {
    const { client_name: _omitted, ...withoutName } = DOCUMENT;
    expect(
      validateClientMetadataDocument(CLIENT_ID, withoutName).clientName,
    ).toBe("claude.ai");
  });

  it.each([
    [
      "a client_id that differs from the URL",
      { ...DOCUMENT, client_id: "https://evil.example/c" },
    ],
    ["no redirect URIs", { ...DOCUMENT, redirect_uris: [] }],
    [
      "a non-HTTPS, non-loopback redirect",
      { ...DOCUMENT, redirect_uris: ["http://evil.example/cb"] },
    ],
    [
      "a confidential client",
      { ...DOCUMENT, token_endpoint_auth_method: "private_key_jwt" },
    ],
    ["a non-object", ["not", "an", "object"]],
  ])("rejects %s", (_label, document) => {
    expect(() => validateClientMetadataDocument(CLIENT_ID, document)).toThrow(
      ClientMetadataError,
    );
  });
});

describe("fetchClientMetadataJson", () => {
  it("refuses hosts that resolve to private addresses (SSRF)", async () => {
    await expect(
      fetchClientMetadataJson("https://localhost/client.json"),
    ).rejects.toThrow(/private address/);
  });

  it("refuses URLs that aren't metadata document URLs", async () => {
    await expect(
      fetchClientMetadataJson("http://example.com/client.json"),
    ).rejects.toBeInstanceOf(ClientMetadataError);
  });
});
