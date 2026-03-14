import React from 'react';
import { theme } from 'theme/theme';

interface LegalSectionProps {
  title: string;
  children?: React.ReactNode;
  subsections?: Array<{ title: string; content: React.ReactNode }>;
}

export const LegalSection: React.FC<LegalSectionProps> = ({ title, children, subsections }) => {
  return (
    <section style={{ marginBottom: theme.spacing.xl }}>
      <h2
        style={{
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.bold,
          marginBottom: theme.spacing.md,
          marginTop: theme.spacing.lg,
        }}
      >
        {title}
      </h2>
      {children}
      {subsections?.map(subsection => (
        <div key={subsection.title}>
          <h3
            style={{
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
              marginTop: theme.spacing.md,
            }}
          >
            {subsection.title}
          </h3>
          {subsection.content}
        </div>
      ))}
    </section>
  );
};
