import { API_URL } from 'config/api';
import { MCP_CLIENT_SERVER_NAME, MCP_ENDPOINT_PATH } from 'constants/claudeAccess';

const JSON_INDENT = 2;

export function mcpEndpointUrl(apiUrl: string = API_URL): string {
  return `${apiUrl.replace(/\/+$/, '')}${MCP_ENDPOINT_PATH}`;
}

/** One-line `claude mcp add` for Claude Code. */
export function claudeCodeCommand(token: string, apiUrl?: string): string {
  return `claude mcp add --transport http ${MCP_CLIENT_SERVER_NAME} ${mcpEndpointUrl(apiUrl)} --header "Authorization: Bearer ${token}"`;
}

/**
 * `claude_desktop_config.json` entry. Claude Desktop's config file only
 * launches local servers, so the mcp-remote bridge forwards to the HTTP
 * endpoint. The header is passed via env (no space after the colon) because
 * args containing spaces break on Windows.
 */
export function claudeDesktopConfig(token: string, apiUrl?: string): string {
  const config = {
    mcpServers: {
      [MCP_CLIENT_SERVER_NAME]: {
        command: 'npx',
        args: ['-y', 'mcp-remote', mcpEndpointUrl(apiUrl), '--header', 'Authorization:${BEARLYMAIL_AUTH}'],
        env: { BEARLYMAIL_AUTH: `Bearer ${token}` },
      },
    },
  };
  return JSON.stringify(config, null, JSON_INDENT);
}
