import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { InlineAttachmentRef } from 'utils/emailBodyUtils';

import { API_URL } from 'config/api';

interface AttachmentInput {
  attachmentId: string;
  contentId?: string;
  mimeType: string;
  inlineData?: string;
}

/**
 * Fetches inline image attachments that have a CID reference but no embedded
 * bytes (i.e. Gmail gave them an attachmentId instead of body.data).
 *
 * Returns the original attachments immediately (so the email renders at once
 * with cid: stripped), then triggers a re-render with inlineData filled in
 * once the fetch completes.
 */
export function useResolvedInlineImages(
  emailId: string,
  attachments: AttachmentInput[] | undefined,
): InlineAttachmentRef[] | undefined {
  const [resolved, setResolved] = useState<InlineAttachmentRef[] | undefined>(attachments);
  const cancelledRef = useRef(false);

  // Stable key so the effect only re-runs when attachment IDs actually change.
  const attachmentIdsKey = attachments?.map(att => att.attachmentId).join(',') ?? '';

  useEffect(() => {
    cancelledRef.current = false;

    if (!attachments || attachments.length === 0) {
      setResolved(attachments);
      return;
    }

    // Inline images that need fetching: have a CID but no embedded bytes.
    // Skip synthetic inline-* IDs (ICS, small embedded images) — they already
    // have inlineData set by the server parser.
    const toFetch = attachments.filter(
      att => att.contentId && !att.inlineData && !att.attachmentId.startsWith('inline-'),
    );

    if (toFetch.length === 0) {
      setResolved(attachments);
      return;
    }

    Promise.all(
      toFetch.map(async att => {
        try {
          const resp = await axios.get<{ base64Content: string; mimeType: string }>(
            `${API_URL}/emails/${emailId}/attachments/${att.attachmentId}`,
          );
          return {
            contentId: att.contentId!,
            mimeType: resp.data.mimeType || att.mimeType,
            inlineData: resp.data.base64Content,
          };
        } catch {
          return null;
        }
      }),
    ).then(results => {
      if (cancelledRef.current) {
        return;
      }
      const fetched = new Map(
        results.filter(Boolean).map(res => [res!.contentId, res!] as const),
      );
      setResolved(
        attachments.map(att =>
          att.contentId && fetched.has(att.contentId)
            ? {
                ...att,
                inlineData: fetched.get(att.contentId)!.inlineData,
                mimeType: fetched.get(att.contentId)!.mimeType,
              }
            : att,
        ),
      );
    });

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId, attachmentIdsKey]);

  return resolved;
}
