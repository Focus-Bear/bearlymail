/**
 * CollapsibleDemo — stateful wrapper for CollapsibleSection stories.
 * Manages collapse state so stories remain declarative.
 */
import React, { useState } from 'react';

import { CollapsibleSection } from 'components/common/CollapsibleSection';

export interface CollapsibleDemoProps {
  title: string;
  accent: string;
  accentBg: string;
  icon?: string;
  preview?: string;
  defaultCollapsed?: boolean;
  children?: React.ReactNode;
}

export const CollapsibleDemo: React.FC<CollapsibleDemoProps> = ({
  title,
  accent,
  accentBg,
  icon,
  preview,
  defaultCollapsed = false,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <CollapsibleSection
      icon={<span>{icon}</span>}
      title={title}
      isCollapsed={collapsed}
      onToggle={() => setCollapsed(prev => !prev)}
      accentColor={accent}
      backgroundColor={accentBg}
      preview={preview}
    >
      {children}
    </CollapsibleSection>
  );
};
