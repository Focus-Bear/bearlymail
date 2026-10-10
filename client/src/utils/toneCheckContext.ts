import { extractEmailAddress } from 'utils/emailUtils';

export interface ToneCheckRecipient {
  email: string;
  name?: string;
}

/**
 * The composer state the tone check needs beyond the draft text: what is
 * actually attached (so it stops claiming a missing attachment) and who the
 * draft is actually going to (so it can spot a copy-pasted greeting addressed
 * to someone else).
 */
export interface ToneCheckContext {
  attachmentFilenames: string[];
  recipients: ToneCheckRecipient[];
}

/**
 * Matches one recipient: a display name (quoted or bare) followed by an
 * angle-bracketed address, or a bare address. Scanning rather than splitting on
 * commas keeps `"Smith, Rob" <rob@acme.com>` as a single recipient.
 */
const RECIPIENT_PATTERN = /(?:"([^"]*)"|([^<>,;"]*))\s*<([^>]+)>|([^\s,;<>"]+@[^\s,;<>"]+)/g;

/**
 * Parses a raw recipient field ("Rob Smith <rob@acme.com>, sam@acme.com") into
 * structured recipients. Entries without a parsable address are dropped.
 */
export const parseRecipientField = (raw: string | undefined): ToneCheckRecipient[] => {
  if (!raw) {
    return [];
  }
  const recipients: ToneCheckRecipient[] = [];
  for (const match of raw.matchAll(RECIPIENT_PATTERN)) {
    const [, quotedName, bareName, bracketedAddress, bareAddress] = match;
    const email = extractEmailAddress(bracketedAddress ?? bareAddress);
    if (!email.includes('@')) {
      continue;
    }
    const name = (quotedName ?? bareName ?? '').trim();
    recipients.push(name ? { email, name } : { email });
  }
  return recipients;
};

/**
 * Builds the tone-check context from the composer's current state. Both the
 * inline reply composer and the compose page use this so the two send paths
 * always send the same shape.
 */
export const buildToneCheckContext = (params: {
  files?: File[];
  forwardedFilenames?: string[];
  recipientFields?: Array<string | undefined>;
  recipients?: ToneCheckRecipient[];
}): ToneCheckContext => {
  const attachedFiles = (params.files ?? []).map(file => file.name);
  const fieldRecipients = (params.recipientFields ?? []).flatMap(parseRecipientField);
  return {
    attachmentFilenames: [...attachedFiles, ...(params.forwardedFilenames ?? [])],
    recipients: [...(params.recipients ?? []), ...fieldRecipients],
  };
};
