import { QUERY_LIMITS } from "../../../constants/query-limits";
import {
  encodeMailboxDisplayName,
  encodeRfc2047Unstructured,
} from "../../../utils/rfc2047-header.util";
import {
  EmailAttachmentData,
  EmailRecipient,
} from "../../interfaces/email-provider.interface";

/**
 * Build email content with support for attachments and HTML using multipart MIME
 */
export function buildEmailContent(options: {
  to: EmailRecipient[];
  subject: string;
  body: string;
  htmlBody?: string;
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  attachments?: EmailAttachmentData[];
  headers?: Record<string, string>;
}): string {
  const formatRecipient = (recipient: EmailRecipient) =>
    recipient.name
      ? `${encodeMailboxDisplayName(recipient.name)} <${recipient.email}>`
      : recipient.email;

  const toHeader = options.to.map(formatRecipient).join(", ");
  const ccHeader =
    options.cc && options.cc.length > 0
      ? options.cc.map(formatRecipient).join(", ")
      : null;
  const bccHeader =
    options.bcc && options.bcc.length > 0
      ? options.bcc.map(formatRecipient).join(", ")
      : null;

  const hasHtmlBody = !!options.htmlBody;

  // Build email headers
  const headerLines: string[] = [
    `To: ${toHeader}`,
    `Subject: ${encodeRfc2047Unstructured(options.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (ccHeader) {
    headerLines.push(`Cc: ${ccHeader}`);
  }
  if (bccHeader) {
    headerLines.push(`Bcc: ${bccHeader}`);
  }

  // Add custom headers if provided
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      headerLines.push(`${key}: ${value}`);
    }
  }

  const regularAttachments = (options.attachments ?? []).filter(
    (att) => !att.contentId,
  );
  const inlineAttachments = (options.attachments ?? []).filter(
    (att) => !!att.contentId,
  );
  const hasRegularAttachments = regularAttachments.length > 0;
  const hasInlineAttachments = inlineAttachments.length > 0;

  let bodyContent: string;

  if (hasRegularAttachments || hasInlineAttachments) {
    bodyContent = buildMultipartMixedBody(
      { ...options, attachments: regularAttachments },
      headerLines,
      inlineAttachments,
    );
  } else if (hasHtmlBody) {
    bodyContent = buildMultipartAlternativeBody(options, headerLines);
  } else {
    // Simple text email
    headerLines.push("Content-Type: text/plain; charset=UTF-8");
    bodyContent = options.body;
  }

  return [...headerLines, "", bodyContent].join("\r\n");
}

function buildBodyParts(
  body: string,
  htmlBody: string | undefined,
  mixedBoundary: string,
  inlineAttachments: EmailAttachmentData[] = [],
): string[] {
  const parts: string[] = [];

  if (htmlBody) {
    if (inlineAttachments.length > 0) {
      // Wrap text+html in multipart/related so inline CID images travel with the body
      const relatedBoundary = `----=_Rel_${Date.now()}_${Math.random().toString(QUERY_LIMITS.RANDOM_BASE_36).substring(QUERY_LIMITS.RANDOM_STRING_START, QUERY_LIMITS.MESSAGE_ID_SUFFIX)}`;
      const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(QUERY_LIMITS.RANDOM_BASE_36).substring(QUERY_LIMITS.RANDOM_STRING_START, QUERY_LIMITS.MESSAGE_ID_SUFFIX)}`;

      parts.push(
        `--${mixedBoundary}`,
        `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
        "",
        // multipart/alternative inside multipart/related
        `--${relatedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        "",
        `--${altBoundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        body,
        `--${altBoundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        htmlBody,
        `--${altBoundary}--`,
      );

      // Inline image parts inside multipart/related
      for (const img of inlineAttachments) {
        const base64Content = img.content.toString("base64");
        const chunkedContent =
          base64Content.match(/.{1,76}/g)?.join("\r\n") || base64Content;
        parts.push(
          `--${relatedBoundary}`,
          `Content-Type: ${img.mimeType}; name="${img.filename}"`,
          "Content-Transfer-Encoding: base64",
          "Content-Disposition: inline",
          `Content-ID: <${img.contentId}>`,
          "",
          chunkedContent,
        );
      }

      parts.push(`--${relatedBoundary}--`);
    } else {
      const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(QUERY_LIMITS.RANDOM_BASE_36).substring(QUERY_LIMITS.RANDOM_STRING_START, QUERY_LIMITS.MESSAGE_ID_SUFFIX)}`;
      parts.push(
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        "",
      );
      parts.push(
        `--${altBoundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        body,
      );
      parts.push(
        `--${altBoundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        htmlBody,
      );
      parts.push(`--${altBoundary}--`);
    }
  } else {
    parts.push(
      `--${mixedBoundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      body,
    );
  }

  return parts;
}

function buildAttachmentParts(
  attachments: EmailAttachmentData[],
  mixedBoundary: string,
): string[] {
  const parts: string[] = [];

  for (const attachment of attachments) {
    const base64Content = attachment.content.toString("base64");
    const chunkedContent =
      base64Content.match(/.{1,76}/g)?.join("\r\n") || base64Content;
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      chunkedContent,
    );
  }

  return parts;
}

function buildMultipartMixedBody(
  options: {
    body: string;
    htmlBody?: string;
    attachments?: EmailAttachmentData[];
  },
  headerLines: string[],
  inlineAttachments: EmailAttachmentData[] = [],
): string {
  const mixedBoundary = `----=_Part_${Date.now()}_${Math.random().toString(QUERY_LIMITS.RANDOM_BASE_36).substring(QUERY_LIMITS.RANDOM_STRING_START, QUERY_LIMITS.MESSAGE_ID_SUFFIX)}`;
  headerLines.push(
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  );

  const parts = [
    ...buildBodyParts(
      options.body,
      options.htmlBody,
      mixedBoundary,
      inlineAttachments,
    ),
    ...(options.attachments
      ? buildAttachmentParts(options.attachments, mixedBoundary)
      : []),
    `--${mixedBoundary}--`,
  ];

  return parts.join("\r\n");
}

function buildMultipartAlternativeBody(
  options: {
    body: string;
    htmlBody?: string;
  },
  headerLines: string[],
): string {
  const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(QUERY_LIMITS.RANDOM_BASE_36).substring(QUERY_LIMITS.RANDOM_STRING_START, QUERY_LIMITS.MESSAGE_ID_SUFFIX)}`;
  headerLines.push(
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
  );

  const parts: string[] = [];

  // Plain text part
  parts.push(`--${altBoundary}`);
  parts.push("Content-Type: text/plain; charset=UTF-8");
  parts.push("Content-Transfer-Encoding: 7bit");
  parts.push("");
  parts.push(options.body);

  // HTML part
  if (options.htmlBody) {
    parts.push(`--${altBoundary}`);
    parts.push("Content-Type: text/html; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: 7bit");
    parts.push("");
    parts.push(options.htmlBody);
  }

  parts.push(`--${altBoundary}--`);
  return parts.join("\r\n");
}

/**
 * Encode email content for Gmail API
 */
export function encodeEmailForGmail(emailContent: string): string {
  return Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
