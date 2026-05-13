import { useEffect } from 'react';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap';

function injectLink(rel: string, href: string, crossOrigin = false): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (crossOrigin) {
    link.crossOrigin = '';
  }
  document.head.appendChild(link);
  return link;
}

/**
 * Injects the landing-page font stack (Inter / Instrument Serif / JetBrains Mono)
 * into the document head, with the preconnect hints, and removes them on unmount.
 * Shared by every landing-v2 page so the font wiring lives in one place.
 */
export function useLandingFonts(): void {
  useEffect(() => {
    const links = [
      injectLink('preconnect', 'https://fonts.googleapis.com'),
      injectLink('preconnect', 'https://fonts.gstatic.com', true),
      injectLink('stylesheet', FONTS_HREF),
    ];
    return () => {
      links.forEach(link => document.head.removeChild(link));
    };
  }, []);
}
