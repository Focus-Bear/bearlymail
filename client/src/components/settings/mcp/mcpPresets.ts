import { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { MCPAuthType, MCPServerPurpose } from 'components/settings/workflows/types';

/**
 * Display metadata for each MCP server purpose: a human label, a one-line
 * explanation, and the badge colours used in the connected-server list.
 */
export const getPurposeMeta = (
  translate: TFunction
): Record<MCPServerPurpose, { label: string; description: string; color: string; background: string }> => ({
  workflow: {
    label: translate('settings.mcp.purpose.workflow.label'),
    description: translate('settings.mcp.purpose.workflow.description'),
    color: theme.colors.primary.dark,
    background: theme.colors.primary.subtle,
  },
  sender_context: {
    label: translate('settings.mcp.purpose.senderContext.label'),
    description: translate('settings.mcp.purpose.senderContext.description'),
    color: '#1D4ED8',
    background: '#E0ECFF',
  },
  ask_ai: {
    label: translate('settings.mcp.purpose.askAi.label'),
    description: translate('settings.mcp.purpose.askAi.description'),
    color: '#047857',
    background: theme.colors.success.light,
  },
});

/**
 * A one-click starting point for connecting a known third-party MCP server.
 * Selecting a preset pre-fills the connect form with a sensible name and
 * purpose plus provider-specific guidance. OAuth presets redirect to the
 * provider's consent screen; bearer presets take a pasted endpoint + token.
 */
export interface MCPProviderPreset {
  /** Stable key for the preset. */
  id: string;
  /** Default value for the connection's Name field. */
  name: string;
  /** Single-letter avatar shown in the picker tile. */
  initial: string;
  /** Brand colour for the avatar background. */
  brandColor: string;
  /** Short subtitle shown under the name in the picker. */
  tagline: string;
  /** Pre-selected purpose for this provider. */
  purpose: MCPServerPurpose;
  /**
   * How this provider authenticates. "oauth" runs the MCP authorization flow
   * (redirect to consent); "bearer" uses a pasted API key / token.
   */
  authType: MCPAuthType;
  /**
   * Known hosted endpoint for this provider, pre-filled so the user never has
   * to find/paste it. Omitted for providers whose URL is per-user (e.g. Zoho)
   * or for the custom option.
   */
  defaultServerUrl?: string;
  /** Placeholder for the Server URL field (used when there is no default). */
  urlPlaceholder: string;
  /** Guidance shown above the form fields once the preset is chosen. */
  instructions: string;
  /** Whether this is the catch-all "any MCP server" option. */
  isCustom?: boolean;
}

export const getMcpProviderPresets = (translate: TFunction): MCPProviderPreset[] => [
  {
    id: 'google_drive',
    name: 'Google Drive',
    initial: 'G',
    brandColor: '#1FA463',
    tagline: translate('settings.mcp.preset.googleDrive.tagline'),
    purpose: 'ask_ai',
    authType: 'oauth',
    // Google's official hosted Drive MCP server.
    defaultServerUrl: 'https://drivemcp.googleapis.com/mcp/v1',
    urlPlaceholder: 'https://drivemcp.googleapis.com/mcp/v1',
    instructions: translate('settings.mcp.preset.googleDrive.instructions'),
  },
  {
    id: 'zoho_bigin',
    name: 'Zoho Bigin',
    initial: 'Z',
    brandColor: '#E42527',
    tagline: translate('settings.mcp.preset.zohoBigin.tagline'),
    purpose: 'sender_context',
    authType: 'bearer',
    // Zoho generates a unique per-user MCP URL (with an embedded key), so it
    // can't be pre-filled — the user pastes the one from the Zoho MCP portal.
    urlPlaceholder: 'https://mcp.zoho.com/...',
    instructions: translate('settings.mcp.preset.zohoBigin.instructions'),
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    initial: 'H',
    brandColor: '#FF7A59',
    tagline: translate('settings.mcp.preset.hubspot.tagline'),
    purpose: 'sender_context',
    authType: 'oauth',
    // HubSpot's official hosted MCP server.
    defaultServerUrl: 'https://mcp.hubspot.com',
    urlPlaceholder: 'https://mcp.hubspot.com',
    instructions: translate('settings.mcp.preset.hubspot.instructions'),
  },
  {
    id: 'custom',
    name: '',
    initial: '+',
    brandColor: theme.colors.text.secondary,
    tagline: translate('settings.mcp.preset.custom.tagline'),
    purpose: 'workflow',
    authType: 'bearer',
    urlPlaceholder: 'https://api.example.com/mcp',
    instructions: translate('settings.mcp.preset.custom.instructions'),
    isCustom: true,
  },
];
