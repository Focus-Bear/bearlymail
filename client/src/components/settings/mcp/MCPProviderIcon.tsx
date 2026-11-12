import React from 'react';
import type { IconType } from 'react-icons';
import { FiPlus } from 'react-icons/fi';
import { SiGoogledrive, SiHubspot, SiZoho } from 'react-icons/si';

import type { MCPProviderPreset } from './mcpPresets';

/** Each connected-app preset's logo, drawn on its brand-coloured tile; "custom" gets a plus. */
const PRESET_ICONS: Record<string, IconType> = {
  google_drive: SiGoogledrive,
  zoho_bigin: SiZoho,
  hubspot: SiHubspot,
  custom: FiPlus,
};

/** The preset's logo, or its letter for a preset that has no logo yet. */
export const MCPProviderIcon: React.FC<{ preset: MCPProviderPreset; size: number }> = ({ preset, size }) => {
  const Icon = PRESET_ICONS[preset.id];
  return Icon ? <Icon size={size} aria-hidden data-testid={`mcp-provider-icon-${preset.id}`} /> : <>{preset.initial}</>;
};
