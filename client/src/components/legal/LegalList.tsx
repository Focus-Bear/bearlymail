import React from 'react';
import { theme } from 'theme/theme';

interface LegalListProps {
  items: React.ReactNode[];
}

export const LegalList: React.FC<LegalListProps> = ({ items }) => {
  return (
    <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
      {items.map((item, index) => (
        // Legal list items are static content that never reorders; array index as key is safe here.
        // eslint-disable-next-line react/no-array-index-key -- static legal content, never reordered
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
};
