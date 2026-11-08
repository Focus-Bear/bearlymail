import { authorizationHeaderValue, claudeCodeCommand, mcpClientConfig, mcpEndpointUrl } from './claudeSetupSnippets';

const API = 'https://api.bearlymail.test/';

describe('claudeSetupSnippets', () => {
  it('builds the MCP endpoint without doubling slashes', () => {
    expect(mcpEndpointUrl(API)).toBe('https://api.bearlymail.test/mcp');
  });

  it('builds a token-free Claude Code command that signs in with OAuth', () => {
    expect(claudeCodeCommand(API)).toBe('claude mcp add --transport http bearlymail https://api.bearlymail.test/mcp');
  });

  it('builds the bearer header for other MCP apps', () => {
    expect(authorizationHeaderValue('bm_pat_abc')).toBe('Bearer bm_pat_abc');
  });

  it('builds a generic MCP config that bridges through mcp-remote', () => {
    const config = JSON.parse(mcpClientConfig('bm_pat_abc', API));
    expect(config.mcpServers.bearlymail.args).toContain('https://api.bearlymail.test/mcp');
    expect(config.mcpServers.bearlymail.env.BEARLYMAIL_AUTH).toBe('Bearer bm_pat_abc');
  });
});
