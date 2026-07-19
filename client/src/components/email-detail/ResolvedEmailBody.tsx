import React, { useMemo } from 'react';
import { InlineAttachmentRef } from 'utils/emailBodyUtils';

import { useResolvedInlineImages } from 'hooks/useResolvedInlineImages';

import { EmailBodyIframe } from './EmailBodyIframe';

interface ResolvedEmailBodyProps {
  emailId: string;
  /** Raw (unsanitized) HTML to render. */
  html: string;
  attachments?: Array<{
    attachmentId: string;
    contentId?: string;
    mimeType: string;
    inlineData?: string;
  }>;
  sanitize: (html: string, attachments?: InlineAttachmentRef[]) => string;
}

/**
 * Renders an email body with inline CID images resolved to data: URIs.
 *
 * For small inline images the server already embeds inlineData, so they
 * resolve immediately. For large inline images (attachmentId without inlineData)
 * the component fetches the attachment content from the API in the background
 * and re-renders once the images arrive.
 */
export const ResolvedEmailBody: React.FC<ResolvedEmailBodyProps> = ({
  emailId,
  html,
  attachments,
  sanitize,
}) => {
  const resolvedAttachments = useResolvedInlineImages(emailId, attachments);

  const processedHtml = useMemo(
    () => sanitize(html, resolvedAttachments),
    [html, resolvedAttachments, sanitize],
  );

  return <EmailBodyIframe html={processedHtml} />;
};