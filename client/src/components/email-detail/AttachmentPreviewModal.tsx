import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_ERROR_DARK, COLOR_WHITE_FULL } from 'constants/colors';
import { EMOJI_CLOSE, EMOJI_DOWNLOAD } from 'constants/emojis';
import { OPACITY_DISABLED_ALT, OPACITY_FULL, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';
import { KEY_ESCAPE } from 'constants/strings';

interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface AttachmentPreviewModalProps {
  emailId: string;
  attachment: EmailAttachment;
  onClose: () => void;
  onDownload: (emailId: string, attachmentId: string, filename: string) => Promise<void>;
}

const BG_OVERLAY = `rgba(0, 0, 0, 0.85)`;
const BG_TOOLBAR = `rgba(0, 0, 0, 0.6)`;
const BG_CLOSE_BUTTON = `rgba(255, 255, 255, 0.15)`;

const PreviewLoading: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ color: COLOR_WHITE_FULL, fontSize: theme.typography.fontSize.md }}>
      {t('emailDetail.previewLoading')}
    </div>
  );
};

interface PreviewErrorProps {
  message: string;
}
const PreviewError: React.FC<PreviewErrorProps> = ({ message }) => (
  <div
    style={{
      color: COLOR_ERROR_DARK,
      fontSize: theme.typography.fontSize.md,
      textAlign: 'center',
    }}
  >
    {message}
  </div>
);

interface ImagePreviewProps {
  src: string;
  alt: string;
}
const ImagePreview: React.FC<ImagePreviewProps> = ({ src, alt }) => (
  <img
    src={src}
    alt={alt}
    style={{
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      borderRadius: theme.borderRadius.sm,
      boxShadow: theme.shadows.xl,
    }}
  />
);

interface PdfPreviewProps {
  src: string;
  title: string;
}
const PdfPreview: React.FC<PdfPreviewProps> = ({ src, title }) => (
  <iframe
    src={src}
    title={title}
    style={{
      width: '100%',
      height: '100%',
      border: 'none',
      borderRadius: theme.borderRadius.sm,
    }}
  />
);

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  emailId,
  attachment,
  onClose,
  onDownload,
}) => {
  const { t } = useTranslation();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchAttachment = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await axios.get(
          `${API_URL}/emails/${emailId}/attachments/${attachment.attachmentId}`,
          { responseType: 'json' },
        );

        if (cancelled) {
          return;
        }

        const base64Data = response.data.base64Content;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: attachment.mimeType });
        const url = window.URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load attachment preview:', err);
          setError(t('emailDetail.previewLoadError'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchAttachment();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        window.URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [emailId, attachment.attachmentId, attachment.mimeType, t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      await onDownload(emailId, attachment.attachmentId, attachment.filename);
    } finally {
      setIsDownloading(false);
    }
  }, [onDownload, emailId, attachment.attachmentId, attachment.filename]);

  const isImage = attachment.mimeType.startsWith('image/');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('emailDetail.previewTitle', { filename: attachment.filename })}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: BG_OVERLAY,
        display: 'flex',
        flexDirection: 'column',
        zIndex: Z_INDEX_MODAL_OVERLAY,
      }}
      onClick={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: BG_TOOLBAR,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: COLOR_WHITE_FULL,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '60%',
          }}
        >
          {attachment.filename}
        </span>
        <div style={{ display: 'flex', gap: theme.spacing.sm, flexShrink: 0 }}>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            aria-label={t('emailDetail.downloadAttachment')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              backgroundColor: theme.colors.primary.main,
              color: COLOR_WHITE_FULL,
              border: 'none',
              borderRadius: theme.borderRadius.sm,
              cursor: isDownloading ? 'wait' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
              opacity: isDownloading ? OPACITY_DISABLED_ALT : OPACITY_FULL,
            }}
          >
            <span>{EMOJI_DOWNLOAD}</span>
            <span>{isDownloading ? t('emailDetail.downloading') : t('emailDetail.download')}</span>
          </button>
          <button
            onClick={onClose}
            aria-label={t('emailDetail.closePreview')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              backgroundColor: BG_CLOSE_BUTTON,
              color: COLOR_WHITE_FULL,
              border: 'none',
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.md,
            }}
          >
            {EMOJI_CLOSE}
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: theme.spacing.lg,
        }}
      >
        {isLoading ? (
          <PreviewLoading />
        ) : error ? (
          <PreviewError message={error} />
        ) : (
          blobUrl &&
          (isImage ? (
            <ImagePreview src={blobUrl} alt={attachment.filename} />
          ) : (
            <PdfPreview src={blobUrl} title={attachment.filename} />
          ))
        )}
      </div>
    </div>
  );
};
