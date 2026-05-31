import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { EMOJI_DOWNLOAD } from 'constants/emojis';
import { FONT_WEIGHT_MEDIUM, FONT_WEIGHT_SEMIBOLD } from 'constants/numbers';

import { AttachmentPreviewModal } from './AttachmentPreviewModal';

interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string;
}

interface EmailAttachmentsProps {
  emailId: string;
  attachments: EmailAttachment[];
}

/**
 * Format file size in human-readable format
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const kb = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(kb));
  return `${Math.round((bytes / Math.pow(kb, i)) * 100) / 100} ${sizes[i]}`;
};

/**
 * Get file icon based on MIME type
 */
const getFileIcon = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) {
    return '🖼️';
  }
  if (mimeType.startsWith('video/')) {
    return '🎥';
  }
  if (mimeType.startsWith('audio/')) {
    return '🎵';
  }
  if (mimeType.includes('pdf')) {
    return '📄';
  }
  if (mimeType.includes('word') || mimeType.includes('document')) {
    return '📝';
  }
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
    return '📊';
  }
  if (mimeType.includes('zip') || mimeType.includes('archive')) {
    return '📦';
  }
  return '📎';
};

const isPreviewable = (mimeType: string): boolean =>
  mimeType.startsWith('image/') || mimeType.includes('pdf');

/**
 * Download attachment from the server
 */
const downloadAttachment = async (emailId: string, attachmentId: string, filename: string): Promise<void> => {
  try {
    const response = await axios.get(`${API_URL}/emails/${emailId}/attachments/${attachmentId}`, {
      responseType: 'json',
    });

    // Decode base64 data
    const base64Data = response.data.base64Content;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create blob and download
    const blob = new Blob([bytes], { type: response.data.mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    alert('Failed to download attachment. Please try again.');
  }
};

interface AttachmentItemProps {
  emailId: string;
  attachment: EmailAttachment;
  onAttachmentClick: (attachment: EmailAttachment) => void;
}

const AttachmentItem: React.FC<AttachmentItemProps> = ({ emailId, attachment, onAttachmentClick }) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const canPreview = isPreviewable(attachment.mimeType);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.sm,
        backgroundColor: isHovered ? theme.colors.primary.light : theme.colors.background.paper,
        border: `1px solid ${isHovered ? theme.colors.primary.main : theme.colors.border.light}`,
        borderRadius: theme.borderRadius.sm,
        transition: theme.transitions.default,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main clickable area — preview or download */}
      <button
        onClick={() => onAttachmentClick(attachment)}
        aria-label={
          canPreview
            ? t('emailDetail.previewAttachment', { filename: attachment.filename })
            : t('emailDetail.downloadAttachment', { filename: attachment.filename })
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          flex: 1,
          minWidth: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          padding: 0,
        }}
      >
        <span style={{ fontSize: theme.typography.fontSize.lg }}>{getFileIcon(attachment.mimeType)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: theme.typography.fontSize.sm,
              fontWeight: FONT_WEIGHT_MEDIUM,
              color: theme.colors.text.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {attachment.filename}
          </div>
          <div
            style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
              marginTop: theme.spacing.xs,
            }}
          >
            {formatFileSize(attachment.size)} • {attachment.mimeType}
            {canPreview && (
              <span style={{ marginLeft: theme.spacing.xs, color: theme.colors.primary.main }}>
                — {t('emailDetail.clickToPreview')}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Separate download button for previewable files */}
      {canPreview && (
        <button
          onClick={() => downloadAttachment(emailId, attachment.attachmentId, attachment.filename)}
          aria-label={t('emailDetail.downloadAttachment', { filename: attachment.filename })}
          title={t('emailDetail.download')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xs,
            background: 'none',
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            flexShrink: 0,
            color: theme.colors.primary.main,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {EMOJI_DOWNLOAD}
        </button>
      )}

      {/* Download icon for non-previewable files */}
      {!canPreview && (
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.primary.main }}>
          {EMOJI_DOWNLOAD}
        </span>
      )}
    </div>
  );
};

/**
 * Email attachments component
 * Displays list of attachments. Images and PDFs can be previewed in a modal;
 * other types trigger a direct download.
 */
export const EmailAttachments: React.FC<EmailAttachmentsProps> = ({ emailId, attachments }) => {
  const { t } = useTranslation();
  const [previewAttachment, setPreviewAttachment] = useState<EmailAttachment | null>(null);

  // Inline images (image MIME type with a contentId) are rendered directly in the email body — exclude
  // them here. Non-image files (PDFs, documents, etc.) may also have a contentId if the sender's email
  // client added a Content-ID header, but they are never embedded inline and must still be shown.
  const visibleAttachments = attachments?.filter(att => !(att.contentId && att.mimeType?.toLowerCase().startsWith('image/'))) ?? [];

  if (visibleAttachments.length === 0) {
    return null;
  }

  const handleAttachmentClick = (attachment: EmailAttachment) => {
    if (isPreviewable(attachment.mimeType)) {
      setPreviewAttachment(attachment);
    } else {
      downloadAttachment(emailId, attachment.attachmentId, attachment.filename);
    }
  };

  return (
    <>
      <div
        style={{
          marginTop: theme.spacing.lg,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.background.default,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <div
          style={{
            fontSize: theme.typography.fontSize.sm,
            fontWeight: FONT_WEIGHT_SEMIBOLD,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.sm,
          }}
        >
          {t('emailDetail.attachments', { count: visibleAttachments.length })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
          {visibleAttachments.map(attachment => (
            <AttachmentItem
              key={attachment.attachmentId}
              emailId={emailId}
              attachment={attachment}
              onAttachmentClick={handleAttachmentClick}
            />
          ))}
        </div>
      </div>

      {previewAttachment && (
        <AttachmentPreviewModal
          emailId={emailId}
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
          onDownload={downloadAttachment}
        />
      )}
    </>
  );
};
