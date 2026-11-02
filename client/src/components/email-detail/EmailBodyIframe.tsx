import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { EVENT_ERROR, EVENT_FONTS_LOADING_DONE, EVENT_LOAD, STRING_NONE } from 'constants/strings';

interface EmailBodyIframeProps {
  html: string;
  minHeight?: number;
}

/** `document.URL` of a document loaded from an iframe's `srcdoc` (the initial document is `about:blank`). */
const SRCDOC_DOCUMENT_URL = 'about:srcdoc';
const DOCUMENT_READY_STATE_LOADING: DocumentReadyState = 'loading';

/** Extra space below the content so sub-pixel rounding never shows a scrollbar. */
const HEIGHT_BUFFER_PX = 10;

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
  const measureContent = useCallback(
    (doc: Document) => {
      const { scrollHeight, scrollWidth } = doc.body;
      setHeight(currentHeight => nextIframeHeight(scrollHeight, currentHeight, minHeight));
      // Track natural content width to enable horizontal scrolling for wide emails
      setContentWidth(scrollWidth > 0 ? scrollWidth : null);
    },
    [minHeight],
  );

  // `html` is a dependency because the iframe is keyed on it: a new body mounts a new iframe.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return undefined;
    }
    return watchEmailDocumentSize(iframe, measureContent);
  }, [html, measureContent]);

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <iframe
        // A fresh iframe per body, so the size watcher can never latch onto the previous
        // body's document while the new srcdoc is still loading.
        key={html}
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

/**
 * The iframe height for `contentHeight` of email content. Grows whenever the content would
 * overflow, but shrinks only when the content is clearly smaller: an email that pins its body to
 * the viewport (`html, body { height: 100% }`) reports the iframe's own height as its content
 * height, and always adding the buffer to that would grow the iframe on every resize, forever.
 */
export function nextIframeHeight(contentHeight: number, currentHeight: number, minHeight: number): number {
  const fittedHeight = Math.max(contentHeight + HEIGHT_BUFFER_PX, minHeight);
  if (contentHeight > currentHeight) {
    return fittedHeight;
  }
  if (currentHeight - fittedHeight > HEIGHT_BUFFER_PX) {
    return fittedHeight;
  }
  return currentHeight;
}

/** The iframe's srcdoc document once it is parsed, or null while it is still loading. */
function parsedEmailDocument(iframe: HTMLIFrameElement): Document | null {
  const doc = iframe.contentDocument;
  if (!doc || doc.URL !== SRCDOC_DOCUMENT_URL || doc.readyState === DOCUMENT_READY_STATE_LOADING || !doc.body) {
    return null;
  }
  return doc;
}

/**
 * Keeps the iframe sized to its email from the moment the email is parsed, rather than from the
 * iframe's `load` event. `load` waits for every image, and some newsletters embed a tracking pixel
 * that deliberately holds its connection open for half a minute to time how long the email is
 * read (HubSpot's duration tracking) — the email sat in a small box with its own scrollbar until
 * then. Images, fonts and layout changes that arrive later re-measure, at most once per frame.
 * Returns a cleanup that stops watching.
 */
function watchEmailDocumentSize(iframe: HTMLIFrameElement, measure: (doc: Document) => void): () => void {
  let pollFrame: number | null = null;
  let measureFrame: number | null = null;
  let stopObserving: (() => void) | null = null;

  const scheduleMeasure = (doc: Document) => {
    if (measureFrame !== null) {
      return;
    }
    measureFrame = requestAnimationFrame(() => {
      measureFrame = null;
      measure(doc);
    });
  };

  const attachWhenParsed = () => {
    const doc = parsedEmailDocument(iframe);
    if (!doc) {
      pollFrame = requestAnimationFrame(attachWhenParsed);
      return;
    }
    pollFrame = null;
    stopObserving = observeDocumentSize(doc, () => scheduleMeasure(doc));
    measure(doc);
  };

  attachWhenParsed();

  return () => {
    if (pollFrame !== null) {
      cancelAnimationFrame(pollFrame);
    }
    if (measureFrame !== null) {
      cancelAnimationFrame(measureFrame);
    }
    stopObserving?.();
  };
}

/**
 * Calls `onChange` whenever the email's layout may have changed size: the document resizing,
 * any image (or other subresource) finishing or failing to load — including images added after
 * parsing — and web fonts arriving. Returns a cleanup that removes every listener.
 */
function observeDocumentSize(doc: Document, onChange: () => void): () => void {
  // jsdom (tests) has no ResizeObserver or FontFaceSet; the load listeners still cover images there.
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onChange);
  resizeObserver?.observe(doc.documentElement);
  resizeObserver?.observe(doc.body);
  // Subresource load/error events do not bubble, so listen in the capture phase.
  doc.addEventListener(EVENT_LOAD, onChange, true);
  doc.addEventListener(EVENT_ERROR, onChange, true);
  const fonts: FontFaceSet | undefined = doc.fonts;
  fonts?.addEventListener(EVENT_FONTS_LOADING_DONE, onChange);

  return () => {
    resizeObserver?.disconnect();
    doc.removeEventListener(EVENT_LOAD, onChange, true);
    doc.removeEventListener(EVENT_ERROR, onChange, true);
    fonts?.removeEventListener(EVENT_FONTS_LOADING_DONE, onChange);
  };
}

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