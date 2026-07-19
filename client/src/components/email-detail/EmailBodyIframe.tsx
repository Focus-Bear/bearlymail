import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface EmailBodyIframeProps {
  html: string;
  minHeight?: number;
}

/**
 * Renders email HTML content inside an iframe for complete CSS isolation.
 * This prevents BearlyMail styles from affecting email rendering and vice versa.
 */
export const EmailBodyIframe: React.FC<EmailBodyIframeProps> = ({ html, minHeight = 100 }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);
  const [contentWidth, setContentWidth] = useState<number | null>(null);

  const fullDocument = buildIframeDocument(html);

  // Resize iframe to match content dimensions (height and natural width)
  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc && doc.body) {
        // Get the full scroll height of the content
        const contentHeight = doc.body.scrollHeight;
        // Add small buffer to prevent any scrollbar flickering
        const newHeight = Math.max(contentHeight + 10, minHeight);
        setHeight(newHeight);

        // Track natural content width to enable horizontal scrolling for wide emails
        const naturalWidth = doc.body.scrollWidth;
        setContentWidth(naturalWidth > 0 ? naturalWidth : null);
      }
    } catch {
      // Cross-origin access error - should not happen with srcdoc
      console.warn('Could not access iframe content for height calculation');
    }
  }, [minHeight]);

  // Update height when iframe loads and when content changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    const handleLoad = () => {
      // Initial height update
      updateHeight();

      // Set up ResizeObserver to watch for content changes
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && doc.body) {
          const resizeObserver = new ResizeObserver(() => {
            updateHeight();
          });
          resizeObserver.observe(doc.body);

          // Also watch for images loading which can change height
          const images = doc.querySelectorAll('img');
          images.forEach(img => {
            if (!img.complete) {
              img.addEventListener('load', updateHeight);
              img.addEventListener('error', updateHeight);
            }
          });

          return () => {
            resizeObserver.disconnect();
            images.forEach(img => {
              img.removeEventListener('load', updateHeight);
              img.removeEventListener('error', updateHeight);
            });
          };
        }
      } catch {
        // Ignore cross-origin errors
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [html, updateHeight]);

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <iframe
        ref={iframeRef}
        srcDoc={fullDocument}
        title="Email content"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        style={{
          width: contentWidth ? `${contentWidth}px` : '100%',
          minWidth: '100%',
          height: `${height}px`,
          border: STRING_NONE,
          display: 'block',
          backgroundColor: COLOR_TRANSPARENT,
        }}
      />
    </div>
  );
};

/** Strip any cid: image tags that slipped through sanitization before they reach the iframe. */
function stripRemainingCidImages(html: string): string {
  return html.replace(/<img[^>]*src=(["'])cid:[^"']*\1[^>]*>/gi, '');
}

function buildIframeDocument(html: string): string {
  const {
    colors: { text, primary, border, greyscale },
  } = theme;
  const baseStyles = `<style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${text.secondary}; background: transparent; word-wrap: break-word; overflow-wrap: break-word; }
    body { padding: 0; }
    a { color: ${primary.main}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; border-collapse: collapse; }
    blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid ${border.light}; color: ${text.tertiary}; }
    /* Tame quoted-reply separators (Outlook's divRplyFwdMsg <hr>, etc.) into a thin,
       muted, well-spaced divider. !important overrides the inline styles those
       clients hard-code (e.g. display:inline-block;width:98%) that render as a stark bar. */
    hr { display: block !important; width: 100% !important; height: 0 !important; border: 0 !important; border-top: 1px solid ${border.light} !important; margin: 1.5em 0 !important; }
    pre, code { font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace; background: ${greyscale.grey050}; border-radius: 4px; }
    pre { padding: 1em; overflow-x: auto; }
    code { padding: 0.2em 0.4em; font-size: 0.9em; }
    pre code { padding: 0; background: none; }
    p { margin: 0 0 1em 0; }
    h1, h2, h3, h4, h5, h6 { margin: 0 0 0.5em 0; line-height: 1.3; }
  </style>`;
  const safeHtml = stripRemainingCidImages(html);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank">${baseStyles}</head><body>${safeHtml}</body></html>`;
}