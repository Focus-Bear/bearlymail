/**
 * Inline style properties dropped from print markup: positioning lets a message
 * escape its slot in the printed page and overlay other content.
 */
const BLOCKED_STYLE_PROPERTIES = new Set(['position', 'z-index']);

/**
 * Values that make the browser fetch or evaluate something (`url(...)`,
 * `image-set(...)`, legacy `expression(...)`, `@import`). These are removed from
 * inline styles so printing a message never triggers a remote request through CSS.
 */
const UNSAFE_STYLE_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|@import|behavior\s*:/i;

/** Attributes removed because they would let message markup target or reuse app selectors, or load images. */
const STRIPPED_ATTRIBUTES = ['id', 'class', 'background'];

function scrubInlineStyle(element: HTMLElement): void {
  const style = element.style;
  for (let index = style.length - 1; index >= 0; index--) {
    const property = style.item(index);
    if (BLOCKED_STYLE_PROPERTIES.has(property) || UNSAFE_STYLE_VALUE.test(style.getPropertyValue(property))) {
      style.removeProperty(property);
    }
  }
  // Re-serialise from the parsed declarations: anything the CSS parser rejected is
  // dropped, and the attribute goes entirely if nothing safe is left.
  const cleaned = style.cssText;
  if (!cleaned || UNSAFE_STYLE_VALUE.test(cleaned)) {
    element.removeAttribute('style');
    return;
  }
  element.setAttribute('style', cleaned);
}

/**
 * Converts already-sanitized email HTML (output of `sanitizeAndProcessHtml`) into
 * markup that is safe to insert into the app's own document rather than the
 * sandboxed email iframe: `<style>`/`<link>` elements are removed so a message's
 * CSS can't restyle the app, `id`/`class` are dropped so it can't hook into app
 * selectors, and inline styles lose fetchable values (`url(...)`) and positioning.
 *
 * Parsing happens in an inert document (no browsing context), so nothing in the
 * markup is fetched while it is being cleaned.
 */
export function toPrintSafeEmailHtml(sanitizedHtml: string): string {
  if (!sanitizedHtml) {
    return '';
  }
  const inertDocument = document.implementation.createHTMLDocument('');
  const container = inertDocument.createElement('div');
  container.innerHTML = sanitizedHtml;

  container.querySelectorAll('style, link').forEach(element => element.remove());
  container.querySelectorAll('*').forEach(element => {
    STRIPPED_ATTRIBUTES.forEach(attribute => element.removeAttribute(attribute));
    if (element.hasAttribute('style')) {
      scrubInlineStyle(element as HTMLElement);
    }
  });

  return container.innerHTML;
}
