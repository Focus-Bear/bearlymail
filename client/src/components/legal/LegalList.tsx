import React from 'react';
import { theme } from 'theme/theme';

interface LegalListProps {
  items: string[];
}

export const LegalList: React.FC<LegalListProps> = ({ items }) => {
  return (
    <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
};
