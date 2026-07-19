/**
 * Named colour constants for use in JSX style props and style assignments.
 * Do NOT use raw hex/named colour strings in style={{ color: '...' }} — use these instead.
 */

// ── Semantic: Success ──────────────────────────────────────────────────────
export const COLOR_SUCCESS_DARK = '#2E7D32' as const; // green-800
export const COLOR_SUCCESS_MED = '#16A34A' as const; // green-600
export const COLOR_SUCCESS_WEB = '#28a745' as const; // bootstrap green

// ── Semantic: Error ────────────────────────────────────────────────────────
export const COLOR_ERROR_DARK = '#C62828' as const; // red-900
export const COLOR_ERROR_MED = '#D32F2F' as const; // red-700
export const COLOR_ERROR_DARK_ALT = '#C8202F' as const; // dark red alt
export const COLOR_ERROR_WEB = '#dc3545' as const; // bootstrap red
export const COLOR_ERROR_GOOGLE = '#EA4335' as const; // google red
export const COLOR_ERROR_WEB_ALT = '#d32f2f' as const; // MUI red-700

// ── Semantic: Warning ──────────────────────────────────────────────────────
export const COLOR_WARNING_DARK = '#F57C00' as const; // orange-700
export const COLOR_WARNING_MED = '#D97706' as const; // amber-600
export const COLOR_WARNING_TEXT = '#92400E' as const; // amber-800 — dark text on warning badge
export const COLOR_BG_WARNING_AMBER = '#FEF3C7' as const; // amber-100 — pending badge background

// ── Semantic: Info / Brand ─────────────────────────────────────────────────
export const COLOR_INFO_PURPLE = '#7C3AED' as const; // violet-600
export const COLOR_INFO_VIOLET = '#7B1FA2' as const; // purple-700
export const COLOR_INFO_BLUE = '#0078D4' as const; // Microsoft blue
export const COLOR_INFO_BLUE_MED = '#3B82F6' as const; // blue-500
export const COLOR_INFO_BLUE_LIGHT = '#E8F4FD' as const; // light blue bg

// ── Neutrals ──────────────────────────────────────────────────────────────
export const COLOR_WHITE = '#fff' as const;
export const COLOR_WHITE_FULL = '#FFFFFF' as const;
export const COLOR_GREY_LIGHT = '#999' as const;
export const COLOR_GREY_MED = '#757575' as const;
export const COLOR_GREY_MID = '#666' as const;
export const COLOR_GREY_MEDIUM = '#6B7280' as const; // gray-500
export const COLOR_NEAR_BLACK = '#1F2937' as const; // gray-800
export const COLOR_TRANSPARENT = 'transparent' as const;
export const COLOR_NAMED_WHITE = 'white' as const;
export const COLOR_NAMED_RED = 'red' as const;

// ── Semantic surfaces / backgrounds ───────────────────────────────────────
export const COLOR_BG_WARNING = '#FFF3E0' as const; // orange-50
export const COLOR_BG_WARNING_ALT = '#FFF7ED' as const; // orange-50 alt (tailwind)
export const COLOR_BG_ERROR = '#FFEBEE' as const; // red-50
export const COLOR_BG_ERROR_ALT = '#FFE6E6' as const; // light red bg
export const COLOR_BG_INFO = '#FFF8E1' as const; // amber-50
export const COLOR_BG_NEUTRAL = '#f5f5f5' as const; // gray-100
export const COLOR_BG_NEUTRAL_ALT = '#FAFAFA' as const; // gray-50
export const COLOR_BG_LIGHT_GRAY = '#E8E8E8' as const; // light gray divider

// ── GitHub Status Colors ───────────────────────────────────────────────────
export const COLOR_GITHUB_OPEN_BG = '#dafbe1' as const; // open state background
export const COLOR_GITHUB_OPEN_FG = '#1a7f37' as const; // open state text & border
export const COLOR_GITHUB_CLOSED_BG = '#ffebe9' as const; // closed state background
export const COLOR_GITHUB_CLOSED_FG = '#cf222e' as const; // closed state text & border
export const COLOR_GITHUB_MERGED_BG = '#fbefff' as const; // merged state background
export const COLOR_GITHUB_MERGED_FG = '#8250df' as const; // merged state text & border

// ── Additional neutrals ────────────────────────────────────────────────────
export const COLOR_GREY_BORDER = '#ccc' as const; // light border / divider grey
