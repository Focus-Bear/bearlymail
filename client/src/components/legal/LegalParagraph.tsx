import React from 'react';
import { theme } from 'theme/theme';

interface LegalParagraphProps {
  children: React.ReactNode;
}

export const LegalParagraph: React.FC<LegalParagraphProps> = ({ children }) => {
  return <p style={{ marginBottom: theme.spacing.md }}>{children}</p>;
};
