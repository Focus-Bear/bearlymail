// Self-hosted landing-page font stack. Imported here rather than loaded from the
// Google Fonts CDN at runtime so we don't relax the strict CSP or leak visitor IPs
// to a third party. Weights mirror the previous css2 request:
//   Inter 400/500/600/700/800, Instrument Serif 400 (roman + italic), JetBrains Mono 400/500.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

/**
 * Shared by every landing-v2 page so the font wiring lives in one place. The font
 * faces are bundled via the static imports above; this hook is a no-op kept for a
 * stable call site across the landing pages.
 */
export function useLandingFonts(): void {}
