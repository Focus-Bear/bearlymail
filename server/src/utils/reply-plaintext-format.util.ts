/**
 * Post-processes LLM-generated reply bodies: unescapes literal "\\n", adds basic
 * paragraph breaks when the model returns a single run-on line, and strips a
 * trailing AES-GCM blob if it leaked into the text (e.g. mistaken sign-off name).
 */

const TRAILING_GCM_BLOB = /,?\s*[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i;

/** Closing phrases that usually start a final paragraph (after sentence-ending punctuation). */
const CLOSING_AFTER_PUNCT = new RegExp(
  `([.!?])\\s+((?:cheers|best regards|kind regards|warm regards|warmly|sincerely|yours truly|many thanks))\\s*,`,
  "gi",
);

export function normalizeGeneratedReplyPlaintext(raw: string): string {
  let text = raw.trim();
  if (!text) {
    return text;
  }

  text = text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\n/g, "\n");

  text = text.replace(TRAILING_GCM_BLOB, (match) =>
    match.startsWith(",") ? "," : "",
  );

  const linesWithContent = text
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (linesWithContent.length >= 2) {
    return text.trimEnd();
  }

  text = text.replace(/^((?:Hi|Hello|Hey|Dear)\s+[^,\n]+),\s+/i, "$1,\n\n");

  text = text.replace(CLOSING_AFTER_PUNCT, "$1\n\n$2,");

  if (!text.includes("\n")) {
    text = text.replace(
      /\s+((?:cheers|best regards|kind regards|warm regards|warmly|sincerely|yours truly|many thanks))\s*,\s*/gi,
      "\n\n$1,\n",
    );
  }

  return text.trimEnd();
}
