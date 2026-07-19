/**
 * RFC 2047 encoded-word helpers for MIME headers (Subject, display names, etc.).
 * Raw UTF-8 in header lines is invalid and causes mojibake when intermediaries
 * reinterpret bytes; Gmail/API consumers may compound corruption on forwards.
 */

const ASCII_HEADER_SAFE = /^[\t\x20-\x7E]*$/;

/** Max UTF-8 bytes per RFC 2047 chunk so each encoded-word stays under 75 chars. */
const RFC2047_MAX_UTF8_BYTES_PER_CHUNK = 18;

const SPACE_BYTE = 0x20;
const BYTE_MASK = 0xff;

/**
 * Split a string into substrings so each part's UTF-8 encoding is at most maxBytes.
 * Never splits inside a Unicode scalar value.
 */
function chunkUtf8ByMaxBytes(value: string, maxBytes: number): string[] {
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of value) {
    const byteLen = Buffer.byteLength(ch, "utf8");
    if (currentBytes + byteLen > maxBytes && current.length > 0) {
      out.push(current);
      current = ch;
      currentBytes = byteLen;
    } else {
      current += ch;
      currentBytes += byteLen;
    }
  }
  if (current.length > 0) {
    out.push(current);
  }
  return out;
}

/**
 * Encode an unstructured header field value (e.g. Subject) using RFC 2047 B-encoding.
 * ASCII-only values are returned unchanged.
 */
export function encodeRfc2047Unstructured(value: string): string {
  if (!value) {
    return value;
  }
  if (ASCII_HEADER_SAFE.test(value)) {
    return value;
  }
  // Keep each encoded-word under 75 chars: =?UTF-8?B? + base64 + ?= → leave room for base64
  const chunks = chunkUtf8ByMaxBytes(value, RFC2047_MAX_UTF8_BYTES_PER_CHUNK);
  return chunks
    .map((part) => {
      const b64 = Buffer.from(part, "utf8").toString("base64");
      return `=?UTF-8?B?${b64}?=`;
    })
    .join(" ");
}

function decodeQEncodedBytes(text: string): Buffer {
  const bytes: number[] = [];
  let i = 0;
  while (i < text.length) {
    if (
      text[i] === "=" &&
      i + 2 < text.length &&
      /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))
    ) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 3;
    } else if (text[i] === "_") {
      bytes.push(SPACE_BYTE);
      i += 1;
    } else {
      bytes.push(text.charCodeAt(i) & BYTE_MASK);
      i += 1;
    }
  }
  return Buffer.from(bytes);
}

function decodeBufferForCharset(buf: Buffer, charset: string): string {
  const cs = charset.toLowerCase().replace(/_/g, "-");
  if (cs === "utf-8" || cs === "utf8") {
    return buf.toString("utf8");
  }
  // ISO-8859-1 / latin1 covers most legacy charsets for Western text
  if (
    cs === "iso-8859-1" ||
    cs === "iso8859-1" ||
    cs === "latin1" ||
    cs === "windows-1252" ||
    cs === "cp1252"
  ) {
    return buf.toString("latin1");
  }
  return buf.toString("utf8");
}

function decodeOneEncodedWord(
  charset: string,
  encoding: string,
  text: string,
): string | null {
  try {
    if (encoding === "B" || encoding === "b") {
      const compact = text.replace(/\s+/g, "");
      const buf = Buffer.from(compact, "base64");
      return decodeBufferForCharset(buf, String(charset));
    }
    if (encoding === "Q" || encoding === "q") {
      const buf = decodeQEncodedBytes(text);
      return decodeBufferForCharset(buf, String(charset));
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Decode RFC 2047 encoded-words in a header value (e.g. Subject from some providers).
 * Linear whitespace between adjacent encoded-words is discarded (RFC 2047 §6.2).
 * Leaves plain text and already-decoded UTF-8 unchanged.
 */
export function decodeRfc2047HeaderValue(input: string): string {
  if (!input || !input.includes("=?")) {
    return input;
  }

  const re = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;
  let out = "";
  let lastIndex = 0;
  let followingEncodedWord = false;
  let match: RegExpExecArray | null;

  while ((match = re.exec(input)) !== null) {
    const gap = input.slice(lastIndex, match.index);
    if (followingEncodedWord && /^\s+$/.test(gap)) {
      // Adjacent encoded-words: ignore separating linear whitespace
    } else {
      out += gap;
    }

    const [fullMatch, charset, encoding, encodedText] = match;
    const decoded = decodeOneEncodedWord(charset, encoding, encodedText);
    out += decoded ?? fullMatch;
    ({ lastIndex } = re);
    followingEncodedWord = true;
  }

  out += input.slice(lastIndex);
  return out;
}

/**
 * Characters that force an RFC 5322 display-name (phrase) to be quoted. Most
 * important here is the comma: an unquoted comma in a `Name <addr>` segment is
 * read as an address separator, producing a malformed header.
 */
const DISPLAY_NAME_MUST_QUOTE = /[()<>[\]:;@\\,."]/;

/**
 * Encode a mailbox display-name for a `Name <addr>` header segment (To/Cc/Bcc/From-style).
 * Plain ASCII names are unchanged; ASCII names with RFC 5322 specials (e.g. a
 * comma) are wrapped in a quoted-string; non-ASCII names use RFC 2047.
 */
export function encodeMailboxDisplayName(displayName: string): string {
  if (!displayName) {
    return displayName;
  }
  // Non-ASCII names become RFC 2047 encoded-words, which contain no header
  // structural characters, so they are safe to drop into `Name <addr>` as-is.
  if (!ASCII_HEADER_SAFE.test(displayName)) {
    return encodeRfc2047Unstructured(displayName);
  }
  // ASCII names containing specials (notably commas) must be a quoted-string,
  // otherwise the comma is parsed as an address separator → "Invalid To header".
  if (DISPLAY_NAME_MUST_QUOTE.test(displayName)) {
    const escaped = displayName.replace(/(["\\])/g, "\\$1");
    return `"${escaped}"`;
  }
  return displayName;
}
