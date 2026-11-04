import { claudeCodeCommand, claudeDesktopConfig, mcpEndpointUrl } from './claudeSetupSnippets';

vi.mock('config/api', () => ({ API_URL: 'https://api.bearlymail.test' }));

describe('claudeSetupSnippets', () => {
  it('builds the MCP endpoint without doubling slashes', () => {
    expect(mcpEndpointUrl('https://api.example.com/')).toBe('https://api.example.com/mcp');
    expect(mcpEndpointUrl()).toBe('https://api.bearlymail.test/mcp');
  });

  it('builds a Claude Code command with the bearer header', () => {
    expect(claudeCodeCommand('bm_pat_abc')).toBe(
      'claude mcp add --transport http bearlymail https://api.bearlymail.test/mcp --header "Authorization: Bearer bm_pat_abc"'
    );
  });

  it('builds a token-free Claude Code command that signs in with OAuth', () => {
    expect(claudeCodeCommand()).toBe('claude mcp add --transport http bearlymail https://api.bearlymail.test/mcp');
  });

  it('builds a Claude Desktop config that bridges through mcp-remote', () => {
    const config = JSON.parse(claudeDesktopConfig('bm_pat_abc'));
    expect(config.mcpServers.bearlymail).toEqual({
      command: 'npx',
      args: ['-y', 'mcp-remote', 'https://api.bearlymail.test/mcp', '--header', 'Authorization:${BEARLYMAIL_AUTH}'],
      env: { BEARLYMAIL_AUTH: 'Bearer bm_pat_abc' },
    });
  });
});
