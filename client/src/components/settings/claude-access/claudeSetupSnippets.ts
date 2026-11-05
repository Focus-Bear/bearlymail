import { API_URL } from 'config/api';
import { MCP_CLIENT_SERVER_NAME, MCP_ENDPOINT_PATH } from 'constants/claudeAccess';

const JSON_INDENT = 2;
const BEARER_PREFIX = 'Bearer ';

export function mcpEndpointUrl(apiUrl: string = API_URL): string {
  return `${apiUrl.replace(/\/+$/, '')}${MCP_ENDPOINT_PATH}`;
}

/** Token-free `claude mcp add` for Claude Code: it signs in through OAuth on first use. */
export function claudeCodeCommand(apiUrl?: string): string {
  return `claude mcp add --transport http ${MCP_CLIENT_SERVER_NAME} ${mcpEndpointUrl(apiUrl)}`;
}

/** The header value an MCP client sends with a personal access token. */
export function authorizationHeaderValue(token: string): string {
  return `${BEARER_PREFIX}${token}`;
}

/**
 * The `mcpServers` config-file entry most MCP apps (Cursor, Windsurf, …)
 * accept. Many only launch local servers, so the mcp-remote bridge forwards
 * to the HTTP endpoint. The header goes via env (no space after the colon)
 * because args containing spaces break on Windows.
 */
export function mcpClientConfig(token: string, apiUrl?: string): string {
  const config = {
    mcpServers: {
      [MCP_CLIENT_SERVER_NAME]: {
        command: 'npx',
        args: ['-y', 'mcp-remote', mcpEndpointUrl(apiUrl), '--header', 'Authorization:${BEARLYMAIL_AUTH}'],
        env: { BEARLYMAIL_AUTH: authorizationHeaderValue(token) },
      },
    },
  };
  return JSON.stringify(config, null, JSON_INDENT);
}
