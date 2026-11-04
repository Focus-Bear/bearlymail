import { lookup as dnsLookup, LookupAddress } from "dns";
import { get as httpsGet } from "https";
import { LookupFunction } from "net";

import { HTTP_HEADERS } from "../constants/http-headers";
import { MCP_OAUTH } from "../constants/mcp-oauth.constants";
import { isBlockedAddress } from "../imap-accounts/mail-server-address";
import { isRegistrableRedirectUri } from "./redirect-uri-policy";

const HTTPS_PROTOCOL = "https:";
const HTTP_OK = 200;
const JSON_MEDIA_TYPE = "application/json";
/** `new URL` resolves dot segments away, so they're checked on the raw string. */
const DOT_SEGMENT_PATTERN = /\/\.\.?(?:[/?#]|$)/;

/** A validated Client ID Metadata Document (draft-ietf-oauth-client-id-metadata-document). */
export interface ClientMetadataDocument {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

export class ClientMetadataError extends Error {}

function parseClientIdUrl(clientId: string): URL | null {
  try {
    const url = new URL(clientId);
    const isValid =
      url.protocol === HTTPS_PROTOCOL &&
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

/**
 * DNS lookup that refuses internal addresses, used as the socket's resolver
 * so the address we vet is the one we connect to (no DNS-rebinding window).
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(
    hostname,
    { all: true, verbatim: true },
    (error, addresses: LookupAddress[]) => {
      if (error) {
        callback(error, "");
        return;
      }
      if (
        addresses.length === 0 ||
        addresses.some(({ address }) => isBlockedAddress(address))
      ) {
        callback(
          new ClientMetadataError(
            `Client metadata host "${hostname}" resolves to a private address`,
          ),
          "",
        );
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      callback(null, addresses[0].address, addresses[0].family);
    },
  );
};

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
