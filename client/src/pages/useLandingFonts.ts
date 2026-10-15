// Self-hosted landing-page font pairing, bundled rather than loaded from the Google
// Fonts CDN so we don't relax the strict CSP or leak visitor IPs to a third party.
// Bricolage Grotesque gives headings warmth and character; Lexend was designed to
// reduce visual stress and improve reading fluency, which suits an ADHD-first audience.
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/lexend/300.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/500.css';
import '@fontsource/lexend/600.css';
import '@fontsource/lexend/700.css';

/**
 * Shared by every landing-v2 page so the font wiring lives in one place. The font
 * faces are bundled via the static imports above; this hook is a no-op kept for a
 * stable call site across the landing pages.
 */
export function useLandingFonts(): void {}
