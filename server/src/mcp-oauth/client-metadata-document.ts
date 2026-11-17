import { get as httpsGet } from "https";
import { isIP } from "net";

import { createPublicOnlyLookup } from "../common/safe-http/safe-http";
import { HTTP_HEADERS } from "../constants/http-headers";
import { MCP_OAUTH } from "../constants/mcp-oauth.constants";
import { isRegistrableRedirectUri } from "./redirect-uri-policy";

const HTTPS_PROTOCOL = "https:";
const HTTP_OK = 200;
const JSON_MEDIA_TYPE = "application/json";
/** `new URL` resolves dot segments away, so they're checked on the raw string. */
const DOT_SEGMENT_PATTERN = /\/\.\.?(?:[/?#]|$)/;
const IPV6_BRACKETS_PATTERN = /^\[|\]$/g;

/** A validated Client ID Metadata Document (draft-ietf-oauth-client-id-metadata-document). */
export interface ClientMetadataDocument {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

export class ClientMetadataError extends Error {}

/**
 * Node skips the socket's `lookup` for an IP address, so publicOnlyLookup never
 * sees one. Real clients are named by domain, so a bare IP is simply refused.
 */
function hasIpAddressHost(url: URL): boolean {
  return isIP(url.hostname.replace(IPV6_BRACKETS_PATTERN, "")) !== 0;
}

function parseClientIdUrl(clientId: string): URL | null {
  try {
    const url = new URL(clientId);
    const isValid =
      url.protocol === HTTPS_PROTOCOL &&
      !hasIpAddressHost(url) &&
      !url.hash &&
      !url.username &&
      !url.password &&
      url.pathname !== "/" &&
      !DOT_SEGMENT_PATTERN.test(clientId);
    return isValid ? url : null;
  } catch {
    return null;
  }
}

/**
 * A client_id that names a metadata document: an HTTPS URL with a path (as
 * claude.ai and Claude Code send). Anything else is a registered client id.
 */
export function isClientMetadataDocumentUrl(clientId: string): boolean {
  return parseClientIdUrl(clientId) !== null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * Checks a fetched document against the rules the MCP spec requires of the
 * authorization server: its `client_id` must equal the URL it came from, it
 * must list redirect URIs, and the client must be a public one.
 */
export function validateClientMetadataDocument(
  clientId: string,
  document: unknown,
): ClientMetadataDocument {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new ClientMetadataError("Client metadata is not a JSON object");
  }
  const fields = document as Record<string, unknown>;
  if (fields.client_id !== clientId) {
    throw new ClientMetadataError(
      "Client metadata client_id does not match its URL",
    );
  }
  const redirectUris = fields.redirect_uris;
  if (
    !isStringArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > MCP_OAUTH.MAX_REDIRECT_URIS ||
    !redirectUris.every(isRegistrableRedirectUri)
  ) {
    throw new ClientMetadataError("Client metadata has invalid redirect_uris");
  }
  const authMethod = fields.token_endpoint_auth_method;
  if (
    authMethod !== undefined &&
    authMethod !== MCP_OAUTH.TOKEN_ENDPOINT_AUTH_METHOD_NONE
  ) {
    throw new ClientMetadataError(
      'Only public clients (token_endpoint_auth_method "none") are supported',
    );
  }
  const rawName =
    typeof fields.client_name === "string" ? fields.client_name.trim() : "";
  const host = new URL(clientId).hostname;
  return {
    clientId,
    clientName: (rawName || host).slice(0, MCP_OAUTH.MAX_CLIENT_NAME_LENGTH),
    redirectUris,
  };
}

/** Socket resolver that refuses internal addresses (see createPublicOnlyLookup). */
const publicOnlyLookup = createPublicOnlyLookup(
  (hostname) =>
    new ClientMetadataError(
      `Client metadata host "${hostname}" resolves to a private address`,
    ),
);

/**
 * Fetches the JSON at a client_id URL. The URL is attacker-chosen, so: HTTPS
 * only, public addresses only, no redirects, a short timeout and a size cap.
 */
export function fetchClientMetadataJson(clientId: string): Promise<unknown> {
  const url = parseClientIdUrl(clientId);
  if (!url) {
    return Promise.reject(
      new ClientMetadataError("client_id is not a valid metadata URL"),
    );
  }
  return new Promise((resolve, reject) => {
    const request = httpsGet(
      url,
      {
        lookup: publicOnlyLookup,
        timeout: MCP_OAUTH.CLIENT_METADATA_FETCH_TIMEOUT_MS,
        headers: { [HTTP_HEADERS.ACCEPT]: JSON_MEDIA_TYPE },
      },
      (response) => {
        if (response.statusCode !== HTTP_OK) {
          response.resume();
          reject(
            new ClientMetadataError(
              `Client metadata fetch returned HTTP ${response.statusCode}`,
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MCP_OAUTH.CLIENT_METADATA_MAX_BYTES) {
            request.destroy(
              new ClientMetadataError("Client metadata document is too large"),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new ClientMetadataError("Client metadata is not JSON"));
          }
        });
        response.on("error", reject);
      },
    );
    request.on("timeout", () =>
      request.destroy(
        new ClientMetadataError("Client metadata fetch timed out"),
      ),
    );
    request.on("error", (error: Error) =>
      reject(
        error instanceof ClientMetadataError
          ? error
          : new ClientMetadataError(
              `Could not fetch client metadata: ${error.message}`,
            ),
      ),
    );
  });
}
