/**
 * Utilities for inline image handling in the reply composer.
 *
 * During editing, pasted images are shown as blob: URLs so the browser can
 * render them in the TipTap editor.  At send time, those blob: URLs must be
 * replaced with the matching cid: references so the email body references the
 * MIME inline-attachment parts correctly.
 */

/**
 * Replace blob: src attributes in img tags with their cid: equivalents, using
 * the data-cid attribute that was stored on each img node at paste time.
 *
 * Handles both attribute orderings:
 *   <img src="blob:..." data-cid="inline-xxx@bearlymail">
 *   <img data-cid="inline-xxx@bearlymail" src="blob:...">
 */
export function replaceBlobUrlsWithCids(html: string): string {
  // Case 1: src appears before data-cid
  let result = html.replace(
    /<img([^>]*?)src="blob:[^"]*"([^>]*?)data-cid="([^"]*)"([^>]*?)>/g,
    '<img$1src="cid:$3"$2data-cid="$3"$4>'
  );
  // Case 2: data-cid appears before src
  result = result.replace(
    /<img([^>]*?)data-cid="([^"]*)"([^>]*?)src="blob:[^"]*"([^>]*?)>/g,
    '<img$1data-cid="$2"$3src="cid:$2"$4>'
  );
  return result;
}
