import axios from 'axios';

import { API_URL } from 'config/api';

const CONTENT_DISPOSITION_HEADER = 'content-disposition';
const FALLBACK_EML_FILENAME = 'email.eml';
/** RFC 5987 extended value: `filename*=UTF-8''<percent-encoded>`. */
const EXTENDED_FILENAME_PATTERN = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/;
const QUOTED_FILENAME_PATTERN = /filename\s*=\s*"([^"]*)"/;

export const buildEmlDownloadUrl = (emailId: string): string =>
  `${API_URL}/emails/${encodeURIComponent(emailId)}/eml`;

function decodeExtendedFilename(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded.trim());
  } catch {
    return null;
  }
}

/**
 * The file name the server chose, preferring the RFC 5987 `filename*` form so
 * non-ASCII subjects keep their real characters.
 */
export function parseContentDispositionFilename(header: string | null | undefined): string | null {
  if (!header) {
    return null;
  }
  const extended = EXTENDED_FILENAME_PATTERN.exec(header);
  const decoded = extended ? decodeExtendedFilename(extended[1]) : null;
  if (decoded) {
    return decoded;
  }
  return QUOTED_FILENAME_PATTERN.exec(header)?.[1] || null;
}

export interface EmlFile {
  blob: Blob;
  filename: string;
}

/** Fetches one message's original source (`message/rfc822`) from the API. */
export async function fetchEmlFile(emailId: string): Promise<EmlFile> {
  const response = await axios.get<Blob>(buildEmlDownloadUrl(emailId), { responseType: 'blob' });
  const header = response.headers[CONTENT_DISPOSITION_HEADER] as string | undefined;
  return {
    blob: response.data,
    filename: parseContentDispositionFilename(header) ?? FALLBACK_EML_FILENAME,
  };
}
