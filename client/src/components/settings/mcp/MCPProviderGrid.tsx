import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { getMcpProviderPresets, MCPProviderPreset } from './mcpPresets';

interface MCPProviderGridProps {
  onSelect: (preset: MCPProviderPreset) => void;
}

/**
 * Quick-connect picker: a tile per known provider (Google Drive, Zoho Bigin,
 * HubSpot) plus a "Custom server" tile. Selecting a tile opens the connect
 * form pre-filled for that provider.
 */
export const MCPProviderGrid: React.FC<MCPProviderGridProps> = ({ onSelect }) => {
  const { t } = useTranslation();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: theme.spacing.sm,
      }}
    >
      {getMcpProviderPresets(t).map(preset => {
        const isHovered = hoveredId === preset.id;
        return (
        <button
          key={preset.id}
          type="button"
          onClick={() => onSelect(preset)}
          onMouseEnter={() => setHoveredId(preset.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            textAlign: 'left',
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${isHovered ? theme.colors.primary.main : theme.colors.border.light}`,
            background: isHovered ? theme.colors.interactive.hover : theme.colors.background.paper,
            cursor: 'pointer',
            transition: theme.transitions.fast,
          }}
        >
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: theme.borderRadius.sm,
              background: preset.isCustom ? theme.colors.background.subtle : preset.brandColor,
              color: preset.isCustom ? theme.colors.text.secondary : '#FFFFFF',
              border: preset.isCustom ? `1px dashed ${theme.colors.border.default}` : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {preset.initial}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: theme.colors.text.primary }}>
              {preset.isCustom ? t('settings.mcp.grid.customServer') : preset.name}
            </span>
            <span style={{ display: 'block', fontSize: 12, color: theme.colors.text.secondary, marginTop: 1 }}>
              {preset.tagline}
            </span>
          </span>
        </button>
        );
      })}
    </div>
  );
};
