import React from 'react';
import { theme } from 'theme/theme';

interface LegalListProps {
  items: (string | React.ReactNode)[];
}

export const LegalList: React.FC<LegalListProps> = ({ items }) => {
  return (
    <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
      {items.map((item, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
};
