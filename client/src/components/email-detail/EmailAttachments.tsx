import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { API_URL } from 'config/api';
import axios from 'axios';
import { FONT_WEIGHT_MEDIUM, FONT_WEIGHT_SEMIBOLD } from 'constants/numbers';

interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface EmailAttachmentsProps {
  emailId: string;
  attachments: EmailAttachment[];
}

/**
 * Format file size in human-readable format
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
};

/**
 * Get file icon based on MIME type
 */
const getFileIcon = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎥';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
  return '📎';
};

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

/**
 * Email attachments component
 * Displays list of attachments with download functionality
 */
export const EmailAttachments: React.FC<EmailAttachmentsProps> = ({ emailId, attachments }) => {
  const { t } = useTranslation();

  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
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
        {t('emailDetail.attachments', { count: attachments.length })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        {attachments.map((attachment) => (
          <button
            key={attachment.attachmentId}
            onClick={() => downloadAttachment(emailId, attachment.attachmentId, attachment.filename)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              transition: theme.transitions.default,
              textAlign: 'left',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.primary.light;
              e.currentTarget.style.borderColor = theme.colors.primary.main;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.background.paper;
              e.currentTarget.style.borderColor = theme.colors.border.light;
            }}
          >
            <span style={{ fontSize: theme.typography.fontSize.lg }}>
              {getFileIcon(attachment.mimeType)}
            </span>
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
              </div>
            </div>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.primary.main }}>
              ⬇️
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
