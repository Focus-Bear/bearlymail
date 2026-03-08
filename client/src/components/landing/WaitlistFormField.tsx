import React from 'react';
import { theme } from 'theme/theme';

import { INPUT_TYPE_TEXTAREA } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface WaitlistFormFieldProps {
  label: string;
  type?: 'text' | 'email' | 'textarea';
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  required?: boolean;
  rows?: number;
}

/**
 * Reusable form field component for waitlist form
 */
export const WaitlistFormField: React.FC<WaitlistFormFieldProps> = ({
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  required = false,
  rows,
}) => {
  const { isMobile } = useResponsiveBreakpoints();

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: isMobile ? theme.spacing.sm : theme.spacing.xs,
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeight.medium,
    fontSize: theme.typography.fontSize.base,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: isMobile ? theme.spacing.md : theme.spacing.md,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSize.base,
    boxSizing: 'border-box',
    fontFamily: theme.typography.fontFamily,
  };

  const getFieldMarginBottom = (): string => {
    if (isMobile) {
      return theme.spacing.md;
    }
    if (type === INPUT_TYPE_TEXTAREA) {
      return theme.spacing.xl;
    }
    return theme.spacing.md;
  };

  return (
    <div style={{ marginBottom: getFieldMarginBottom() }}>
      <label style={labelStyle}>{label}</label>
      {type === INPUT_TYPE_TEXTAREA ? (
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          onBlur={onBlur}
          required={required}
          rows={rows || (isMobile ? 3 : 4)}
          style={{
            ...inputStyle,
            fontFamily: theme.typography.fontFamily,
            resize: 'vertical',
          }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={event => onChange(event.target.value)}
          onBlur={onBlur}
          required={required}
          style={inputStyle}
        />
      )}
    </div>
  );
};
