import React from 'react';
import { theme } from 'theme/theme';

interface ConsentCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  label: string;
  linkText: string;
  linkHref: string;
  required: boolean;
}

/**
 * Reusable consent checkbox component
 */
export const ConsentCheckbox: React.FC<ConsentCheckboxProps> = ({
  checked,
  onChange,
  disabled,
  label,
  linkText,
  linkHref,
  required,
}) => {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: theme.spacing.md,
        cursor: disabled ? 'not-allowed' : 'pointer',
        marginBottom: theme.spacing.md,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        disabled={disabled}
        style={{
          marginTop: '4px',
          width: '20px',
          height: '20px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      />
      <div style={{ flex: 1 }}>
        <span
          style={{
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {label}{' '}
          <a
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={event => event.stopPropagation()}
            style={{
              color: theme.colors.primary.main,
              textDecoration: 'underline',
            }}
          >
            {linkText}
          </a>
          {required && <span style={{ color: theme.colors.accent.error }}> *</span>}
        </span>
      </div>
    </label>
  );
};
