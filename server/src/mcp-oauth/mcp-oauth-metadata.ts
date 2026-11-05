import { MCP_OAUTH } from "../constants/mcp-oauth.constants";
import { MCP_SERVER } from "../constants/mcp-server.constants";
import { ALL_PAT_SCOPES } from "../constants/personal-access-tokens.constants";
import {
  mcpResourceUrl,
  oauthEndpointUrl,
  oauthIssuerUrl,
} from "./mcp-oauth-urls";

const BEARER_METHOD_HEADER = "header";

/** RFC 9728 protected-resource metadata for `/mcp`. */
export function buildProtectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [oauthIssuerUrl()],
    scopes_supported: [...ALL_PAT_SCOPES],
    bearer_methods_supported: [BEARER_METHOD_HEADER],
    resource_name: MCP_SERVER.SERVER_TITLE,
  };
}

/**
 * RFC 8414 authorization-server metadata. claude.ai picks a Client ID
 * Metadata Document only when both `client_id_metadata_document_supported`
 * and the "none" auth method are advertised, else it registers dynamically.
 */
export function buildAuthorizationServerMetadata() {
  return {
    issuer: oauthIssuerUrl(),
    authorization_endpoint: oauthEndpointUrl(MCP_OAUTH.PATHS.AUTHORIZE),
    token_endpoint: oauthEndpointUrl(MCP_OAUTH.PATHS.TOKEN),
    registration_endpoint: oauthEndpointUrl(MCP_OAUTH.PATHS.REGISTER),
    revocation_endpoint: oauthEndpointUrl(MCP_OAUTH.PATHS.REVOKE),
    scopes_supported: [...ALL_PAT_SCOPES],
    response_types_supported: [MCP_OAUTH.RESPONSE_TYPE_CODE],
    grant_types_supported: Object.values(MCP_OAUTH.GRANT_TYPES),
    token_endpoint_auth_methods_supported: [
      MCP_OAUTH.TOKEN_ENDPOINT_AUTH_METHOD_NONE,
    ],
    revocation_endpoint_auth_methods_supported: [
      MCP_OAUTH.TOKEN_ENDPOINT_AUTH_METHOD_NONE,
    ],
    code_challenge_methods_supported: [MCP_OAUTH.CODE_CHALLENGE_METHOD_S256],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}
