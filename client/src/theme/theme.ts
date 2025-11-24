// Color scheme inspired by focusbear.io - ADHD-friendly, calming, minimalist
// Enhanced with more modern, polished shades
export const colors = {
  // Primary colors - Soft, calming blues and teals
  primary: {
    main: '#3B82F6',      // Vibrant but calming blue
    light: '#60A5FA',     // Lighter blue for hover
    dark: '#2563EB',      // Darker blue for active
    subtle: '#EFF6FF',    // Very light blue background
  },
  
  // Secondary colors - Gentle teals/greens
  secondary: {
    main: '#10B981',      // Fresh green/teal
    light: '#34D399',     // Lighter teal
    dark: '#059669',      // Darker teal
    subtle: '#ECFDF5',    // Very light teal background
  },
  
  // Background colors - Clean, neutral with depth
  background: {
    default: '#F3F4F6',   // Cool gray for app background
    paper: '#FFFFFF',      // Pure white for cards
    subtle: '#F9FAFB',     // Very light gray for sections
    overlay: 'rgba(255, 255, 255, 0.8)', // Glassmorphism effect
  },
  
  // Text colors - High contrast but softer than pure black
  text: {
    primary: '#1F2937',    // Deep gray-blue
    secondary: '#6B7280',  // Medium gray
    tertiary: '#9CA3AF',   // Light gray for placeholders
    disabled: '#D1D5DB',   // Very light gray
  },
  
  // Accent colors - For highlights and actions
  accent: {
    success: '#10B981',    // Success green
    warning: '#F59E0B',    // Warm amber
    error: '#EF4444',      // Soft red
    info: '#3B82F6',       // Info blue
    purple: '#8B5CF6',     // Creative purple
  },
  
  // Border and divider
  border: {
    light: '#E5E7EB',     // Very light border
    medium: '#D1D5DB',    // Medium border
    dark: '#9CA3AF',      // Darker border
  },
  
  // Focus and hover states
  interactive: {
    hover: '#F3F4F6',      // Light gray hover
    focus: '#DBEAFE',      // Focus blue ring
    active: '#BFDBFE',     // Active blue background
  },
};

export const theme = {
  colors,
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem',// 30px
      '4xl': '2.25rem', // 36px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  spacing: {
    xs: '0.25rem',  // 4px
    sm: '0.5rem',   // 8px
    md: '1rem',     // 16px
    lg: '1.5rem',   // 24px
    xl: '2rem',     // 32px
    '2xl': '3rem',  // 48px
    '3xl': '4rem',  // 64px
  },
  borderRadius: {
    sm: '0.375rem', // 6px
    md: '0.5rem',   // 8px
    lg: '0.75rem',  // 12px
    xl: '1rem',     // 16px
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  },
  transitions: {
    default: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    fast: 'all 0.1s cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  }
};

export default theme;
