import { EML_DOWNLOAD } from "../constants/eml-download.constants";

/**
 * Control characters plus the characters Windows, macOS or Linux reject in a
 * file name. `"` and `\` also matter for the quoted `filename=` parameter.
 */

const UNSAFE_FILENAME_CHARACTERS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
const WHITESPACE_RUN = /\s+/g;
/** Leading dots would hide the file on Unix; trailing dots/spaces are dropped by Windows. */
const EDGE_DOTS_AND_SPACES = /^[.\s]+|[.\s]+$/g;
const NON_PRINTABLE_ASCII = /[^\x20-\x7e]/g;
/** Characters encodeURIComponent leaves alone but RFC 5987 `attr-char` forbids. */
const RFC5987_RESERVED = /['()*]/g;
const REPLACEMENT_CHARACTER = "_";
const HEX_RADIX = 16;

/**
 * File name for a message's `.eml` download: the subject made safe for every
 * desktop filesystem, capped in length (by code point, so emoji are never cut
 * in half), with a neutral fallback when nothing usable is left.
 */
export function buildEmlFilename(subject: string | null | undefined): string {
  const cleaned = (subject ?? "")
    .replace(UNSAFE_FILENAME_CHARACTERS, REPLACEMENT_CHARACTER)
    .replace(WHITESPACE_RUN, " ");
  const truncated = Array.from(cleaned)
    .slice(0, EML_DOWNLOAD.MAX_FILENAME_STEM_LENGTH)
    .join("")
    .replace(EDGE_DOTS_AND_SPACES, "");
  const stem = truncated || EML_DOWNLOAD.FALLBACK_FILENAME_STEM;
  return `${stem}${EML_DOWNLOAD.FILE_EXTENSION}`;
}

function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(value).replace(
    RFC5987_RESERVED,
    (character) =>
      `%${character.charCodeAt(0).toString(HEX_RADIX).toUpperCase()}`,
  );
}

/**
 * `Content-Disposition` for the download. Carries both an ASCII `filename=`
 * for old clients and an RFC 5987 `filename*=` so non-ASCII subjects
 * (accents, CJK, emoji) keep their real name in modern browsers.
 */
export function buildEmlContentDisposition(
  subject: string | null | undefined,
): string {
  const filename = buildEmlFilename(subject);
  const asciiFilename = filename.replace(
    NON_PRINTABLE_ASCII,
    REPLACEMENT_CHARACTER,
  );
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeRfc5987Value(filename)}`;
}
