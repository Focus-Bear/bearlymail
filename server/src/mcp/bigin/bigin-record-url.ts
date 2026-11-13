import type { MCPServerConfig } from "../../database/entities/mcp-server-config.entity";
import {
  BIGIN_WEB,
  BiginParentModule,
  ZOHO_BASE_DOMAINS,
  ZOHO_REGION_TLDS,
} from "./bigin-sender-context.constants";

type ConnectionHosts = Pick<MCPServerConfig, "serverUrl" | "oauthMetadata">;

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The Zoho region TLD a host belongs to ("accounts.zoho.eu" → "eu"), if any. */
export function zohoRegionOfHost(host: string): string | null {
  for (const tld of ZOHO_REGION_TLDS) {
    const isZohoHost = ZOHO_BASE_DOMAINS.some((base) => {
      const domain = `${base}.${tld}`;
      return host === domain || host.endsWith(`.${domain}`);
    });
    if (isZohoHost) return tld;
  }
  return null;
}

/**
 * The connection's Zoho region. The OAuth issuer is authoritative (it is the
 * account's data centre); the MCP URL is the fallback for bearer connections.
 */
export function zohoRegionOf(connection: ConnectionHosts): string | null {
  const candidates = [
    connection.oauthMetadata?.issuer,
    connection.oauthMetadata?.authorizationEndpoint,
    connection.serverUrl,
  ];
  for (const url of candidates) {
    const host = hostOf(url);
    const region = host ? zohoRegionOfHost(host) : null;
    if (region) return region;
  }
  return null;
}

/**
 * Link to a record in the Bigin web app on the connection's data centre, or
 * null when the region can't be told (a wrong-region link only shows a login).
 */
export function biginRecordUrl(
  connection: ConnectionHosts,
  module: BiginParentModule,
  recordId: string,
): string | null {
  const region = zohoRegionOf(connection);
  if (!region) return null;
  return `${BIGIN_WEB.SCHEME}${BIGIN_WEB.HOST_PREFIX}${region}${BIGIN_WEB.RECORD_PATH}${module.toLowerCase()}/${encodeURIComponent(recordId)}`;
}
