import {
  EmailRecipient,
  EmailAttachmentData,
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
  const formatRecipient = (r: EmailRecipient) =>
    r.name ? `${r.name} <${r.email}>` : r.email;

  const toHeader = options.to.map(formatRecipient).join(", ");
  const ccHeader =
    options.cc && options.cc.length > 0
      ? options.cc.map(formatRecipient).join(", ")
      : null;
  const bccHeader =
    options.bcc && options.bcc.length > 0
      ? options.bcc.map(formatRecipient).join(", ")
      : null;

  const hasAttachments = options.attachments && options.attachments.length > 0;
  const hasHtmlBody = !!options.htmlBody;

  // Build email headers
  const headerLines: string[] = [
    `To: ${toHeader}`,
    `Subject: ${options.subject}`,
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

  let bodyContent: string;

  if (hasAttachments) {
    bodyContent = buildMultipartMixedBody(options, headerLines);
  } else if (hasHtmlBody) {
    bodyContent = buildMultipartAlternativeBody(options, headerLines);
  } else {
    // Simple text email
    headerLines.push("Content-Type: text/plain; charset=UTF-8");
    bodyContent = options.body;
  }

  return [...headerLines, "", bodyContent].join("\r\n");
}

function buildMultipartMixedBody(
  options: {
    body: string;
    htmlBody?: string;
    attachments?: EmailAttachmentData[];
  },
  headerLines: string[],
): string {
  const mixedBoundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  headerLines.push(
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  );

  const parts: string[] = [];

  if (options.htmlBody) {
    // Use multipart/alternative for text + HTML
    const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    parts.push(`--${mixedBoundary}`);
    parts.push(
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    );
    parts.push("");

    // Plain text part
    parts.push(`--${altBoundary}`);
    parts.push("Content-Type: text/plain; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: 7bit");
    parts.push("");
    parts.push(options.body);

    // HTML part
    parts.push(`--${altBoundary}`);
    parts.push("Content-Type: text/html; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: 7bit");
    parts.push("");
    parts.push(options.htmlBody);

    parts.push(`--${altBoundary}--`);
  } else {
    // Text body part only
    parts.push(`--${mixedBoundary}`);
    parts.push("Content-Type: text/plain; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: 7bit");
    parts.push("");
    parts.push(options.body);
  }

  // Attachment parts
  if (options.attachments) {
    for (const attachment of options.attachments) {
      parts.push(`--${mixedBoundary}`);
      parts.push(
        `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      );
      parts.push("Content-Transfer-Encoding: base64");
      parts.push(
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
      );
      parts.push("");
      // Encode attachment content as base64, split into 76-character lines
      const base64Content = attachment.content.toString("base64");
      const chunkedContent =
        base64Content.match(/.{1,76}/g)?.join("\r\n") || base64Content;
      parts.push(chunkedContent);
    }
  }

  parts.push(`--${mixedBoundary}--`);
  return parts.join("\r\n");
}

function buildMultipartAlternativeBody(
  options: {
    body: string;
    htmlBody?: string;
  },
  headerLines: string[],
): string {
  const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
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
