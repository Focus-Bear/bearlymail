/**
 * Removes every `<tag ...>...</tag>` block (for `script` and `style`) in one
 * pass over the input.
 *
 * A single regex with a lazy `[\s\S]*?` body rescans to the end of the input
 * for each opening tag that has no closing tag, so mail made of thousands of
 * unclosed tags takes quadratic time. Here each character is visited a
 * bounded number of times, and an opening tag with no closing tag ends the
 * scan (no later one can have a closing tag either).
 */
export function stripElementBlocks(html: string, tagName: string): string {
  const lower = html.toLowerCase();
  const open = `<${tagName.toLowerCase()}`;
  const close = `</${tagName.toLowerCase()}`;
  const kept: string[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const openAt = findTag(lower, open, cursor);
    if (openAt === -1) break;
    const closeAt = findTag(lower, close, openAt + open.length);
    if (closeAt === -1) break;
    const closeEnd = lower.indexOf(">", closeAt);
    if (closeEnd === -1) break;
    kept.push(html.slice(cursor, openAt));
    cursor = closeEnd + 1;
  }
  kept.push(html.slice(cursor));
  return kept.join("");
}

/** Index of `tag` at a word boundary (`<script` but not `<scripture`). */
function findTag(lower: string, tag: string, from: number): number {
  let at = lower.indexOf(tag, from);
  while (at !== -1) {
    const next = lower[at + tag.length];
    if (next === undefined || !/[a-z0-9_-]/.test(next)) return at;
    at = lower.indexOf(tag, at + tag.length);
  }
  return -1;
}

/**
 * Replaces every `<...>` tag with `replacement`, in one pass.
 *
 * Behaves like `html.replace(/<[^>]*>/g, replacement)` — a tag runs from a
 * `<` to the next `>`, so nested openers such as `<scr<b>ipt>` are removed
 * whole and can never leave a new tag behind — but without that regex's
 * quadratic rescanning when the input has many `<` and no `>`.
 */
export function stripTags(html: string, replacement = ""): string {
  const kept: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const openAt = html.indexOf("<", cursor);
    if (openAt === -1) break;
    const closeAt = html.indexOf(">", openAt + 1);
    if (closeAt === -1) break;
    kept.push(html.slice(cursor, openAt), replacement);
    cursor = closeAt + 1;
  }
  kept.push(html.slice(cursor));
  return kept.join("");
}
