// Focus Bear Brand Colors - Official brand palette
export const colors = {
  // Common
  common: {
    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent',
  },

  // Primary Logo Colors
  primary: {
    main: '#E9902C', // Sunray - Primary accent/orange
    light: '#F0A859', // Lighter Sunray for hover
    dark: '#D87A1A', // Darker Sunray for press (approximated)
    subtle: '#FCEFE0', // Very light Sunray background
  },

  // Secondary Logo Colors
  secondary: {
    main: '#333333', // 700 - Dark grey
    light: '#666666', // 600
    dark: '#0B0B0B', // Rich Black
    subtle: '#FCF8F0', // Secondary White Lace
  },

  // Brand Base Colors
  brand: {
    richBlack: '#0B0B0B', // Rich Black - Main dark color
    sunray: '#E9902C', // Sunray - Primary accent
    whiteLace: '#FFFCF6', // White Lace - Primary background/cream
    whiteLaceSecondary: '#FCF8F0', // Secondary White Lace
  },

  // Sunray Variations
  sunray: {
    main: '#E9902C',
    light1: '#F0A859',
    light2: '#F5C086',
    light3: '#F9D8B3',
    light4: '#FCEFE0',
  },

  // Rich Black Variations
  richBlack: {
    main: '#0B0B0B',
    v1: '#333333', // 700
    v2: '#666666', // 600
    v3: '#999999', // 500
    v4: '#CCCCCC', // 400
    v5: '#EFEFEF', // 300
  },

  // White Lace Variations
  whiteLace: {
    main: '#FFFCF6',
    v1: '#FCF8F0',
    v2: '#F5F0E8',
    v3: '#EFE8E0',
    v4: '#E8E0D8',
    v5: '#E0D8D0',
  },

  // Background colors - Using White Lace and variations
  background: {
    default: '#FFFCF6', // White Lace - Primary background
    paper: '#FFFFFF', // Pure white for cards
    subtle: '#FCF8F0', // Secondary White Lace for sections
    overlay: 'rgba(255, 252, 246, 0.8)', // Glassmorphism effect
    disabled: '#EFEFEF', // Disabled state background (300 greyscale)
    hover: '#FCF8F0', // Light White Lace hover background
  },

  // Overlay colors - For modals, backdrops, and overlays
  overlay: {
    dark: 'rgba(0, 0, 0, 0.5)', // Standard dark overlay (modals)
    darkLight: 'rgba(0, 0, 0, 0.4)', // Lighter dark overlay
    darkHeavy: 'rgba(0, 0, 0, 0.6)', // Heavier dark overlay
    whiteLight: 'rgba(255, 255, 255, 0.2)', // Light white overlay (glass effects)
    blueTint: 'rgba(59, 130, 246, 0.3)', // Blue tinted overlay (highlights)
  },

  // Text colors - Using Rich Black and greyscale
  text: {
    primary: '#0B0B0B', // Rich Black
    secondary: '#333333', // 700
    tertiary: '#666666', // 600
    disabled: '#CCCCCC', // 400
    inverse: '#FFFFFF', // White — for text on dark/filled backgrounds (e.g. selected "All" pill)
  },

  // Priority bucket colors — single source of truth for the visual filter slider track.
  // Replacing hardcoded literals in PriorityRangeSelector.tsx (fix #1526 bug 1).
  priorityBuckets: {
    veryLow: '#64748B', // Slate
    low: '#3B82F6', // Blue
    medium: '#F59E0B', // Amber
    high: '#F97316', // Orange
    veryHigh: '#EF4444', // Red
  },

  // Greyscale
  greyscale: {
    700: '#333333',
    600: '#666666',
    500: '#999999',
    400: '#CCCCCC',
    410: '#D2D2D2',
    350: '#D9D9D9',
    300: '#EFEFEF',
    180: '#E8E8E8',
    grey050: '#F5F5F5',
  },

  // Accent colors - For system messages
  accent: {
    success: '#10B981', // Success green (keeping for system messages)
    warning: '#F59E0B', // Warning amber
    error: '#EF4444', // Error red
    info: '#E9902C', // Info - using Sunray
  },

  // Warning colors - For warning messages
  warning: {
    main: '#F59E0B', // Warning amber
    light: '#FEF3C7', // Light warning background
  },

  // Success colors - For success messages
  success: {
    main: '#10B981', // Success green
    light: '#D1FAE5', // Light success background
  },

  // Error colors - For error messages
  error: {
    main: '#EF4444', // Error red
    dark: '#DC2626', // Darker red for hover states
    light: '#FEE2E2', // Light error background
  },

  // Feedback colors (aliases for error/success/warning)
  feedback: {
    error: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    info: '#3B82F6',
  },

  // Border and divider - Using greyscale
  border: {
    light: '#EFEFEF', // 300
    medium: '#CCCCCC', // 400
    dark: '#999999', // 500
    default: '#CCCCCC', // alias for medium
  },

  // Section-specific accents used by collapsible cards
  section: {
    summary: {
      accent: '#E9902C',
      background: '#FCEFE0',
    },
    notes: {
      accent: '#666666',
      background: '#FCF8F0',
    },
  },

  // Button States - Primary Button
  button: {
    primary: {
      default: '#E9902C', // Sunray
      hover: '#F0A859', // Lighter Sunray
      press: '#D87A1A', // Darker Sunray (approximated)
      disable: '#F5C086', // Pale Sunray
    },
    // Secondary Button
    secondary: {
      default: '#FFFFFF', // White background
      border: '#E9902C', // Sunray border
      text: '#E9902C', // Sunray text
      hoverBorder: '#F0A859', // Lighter Sunray border
      hoverText: '#F0A859', // Lighter Sunray text
      pressBorder: '#D87A1A', // Darker Sunray border
      pressText: '#D87A1A', // Darker Sunray text
      disableBorder: '#F5C086', // Pale Sunray border
      disableText: '#F5C086', // Pale Sunray text
    },
    // Third Button
    third: {
      default: '#FCEFE0', // Very light Sunray background
      text: '#F5C086', // Light Sunray text
      hover: '#F9D8B3', // Even lighter background
      press: '#F5C086', // Slightly darker
      disable: '#F9D8B3', // Pale background
      disableText: '#F5C086', // Pale text
    },
  },

  // Focus and hover states
  interactive: {
    hover: '#FCF8F0', // Light White Lace hover
    focus: '#FCEFE0', // Focus Sunray ring
    active: '#F5C086', // Active Sunray background
  },
};

export const theme = {
  colors,
  typography: {
    // Logo font: Inter Medium
    // Graphic pieces font: Ferwick (with Inter fallback)
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontFamilyGraphic: '"Ferwick", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',

    // Heading Styles - All Bold
    heading: {
      h1: {
        fontSize: '3rem', // 48px
        fontWeight: 700, // Bold
        lineHeight: 1.25,
      },
      h2: {
        fontSize: '2.5rem', // 40px
        fontWeight: 700, // Bold
        lineHeight: 1.25,
      },
      h3: {
        fontSize: '2rem', // 32px
        fontWeight: 700, // Bold
        lineHeight: 1.25,
      },
      h4: {
        fontSize: '1.5rem', // 24px
        fontWeight: 700, // Bold
        lineHeight: 1.25,
      },
      h5: {
        fontSize: '1.25rem', // 20px
        fontWeight: 700, // Bold
        lineHeight: 1.25,
      },
      h6: {
        fontSize: '1rem', // 16px
        fontWeight: 700, // Bold
        lineHeight: 1.25,
      },
    },

    // Body Text Styles
    // Minimum readable sizes: xs=11px, sm=12px, md=13px (WCAG / Apple HIG / Material Design recommend ≥12px)
    body: {
      xLarge: {
        fontSize: '1rem', // 16px — unchanged
        lineHeight: 1.5,
      },
      large: {
        fontSize: '0.875rem', // 14px — unchanged
        lineHeight: 1.5,
      },
      medium: {
        fontSize: '0.8125rem', // 13px — bumped from 12px
        lineHeight: 1.5,
      },
      small: {
        fontSize: '0.75rem', // 12px — bumped from 10px
        lineHeight: 1.5,
      },
      xSmall: {
        fontSize: '0.6875rem', // 11px — bumped from 8px
        lineHeight: 1.5,
      },
    },

    // Legacy fontSize for backward compatibility
    // Scale floor raised: xs 8px→11px, sm 10px→12px, md 12px→13px
    fontSize: {
      xs: '0.6875rem', // 11px (was 8px) — minimum for non-debug text
      sm: '0.75rem', // 12px (was 10px) — small labels, timestamps
      md: '0.8125rem', // 13px (was 12px) — secondary body text (alias)
      base: '1rem', // 16px - Body XLarge
      lg: '0.875rem', // 14px - Body Large
      xl: '1.25rem', // 20px - H5
      '2xl': '1.5rem', // 24px - H4
      '3xl': '2rem', // 32px - H3
      '4xl': '2.5rem', // 40px - H2
      '5xl': '3rem', // 48px - H1
    },

    fontWeight: {
      light: 300,
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
    xs: '0.25rem', // 4px
    sm: '0.5rem', // 8px
    md: '1rem', // 16px
    lg: '1.5rem', // 24px
    xl: '2rem', // 32px
    '2xl': '3rem', // 48px
    '3xl': '4rem', // 64px
  },
  borderRadius: {
    sm: '0.375rem', // 6px
    md: '0.5rem', // 8px
    lg: '0.75rem', // 12px
    xl: '1rem', // 16px
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
  },
};

export default theme;
