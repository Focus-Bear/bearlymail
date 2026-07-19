import React, { useRef, useState } from 'react';
import axios from 'axios';
import { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { BYTES_PER_MB, OPACITY_DISABLED } from 'constants/numbers';

const MAX_MESSAGE_LENGTH = 5000;
const MAX_SCREENSHOT_MB = 10;
const MAX_SCREENSHOT_BYTES = MAX_SCREENSHOT_MB * BYTES_PER_MB;
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

interface Props {
  message: string;
  setMessage: (v: string) => void;
  isSubmitting: boolean;
  submitted: boolean;
  onClose: () => void;
  handleSubmit: (screenshotKey?: string) => void;
  t: TFunction;
}

export const FeedbackForm: React.FC<Props> = ({
  message,
  setMessage,
  isSubmitting,
  submitted,
  onClose,
  handleSubmit,
  t,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setScreenshotError(null);

    if (!file) {
      setScreenshotFile(null);
      setScreenshotPreview(null);
      return;
    }

    if (file.size > MAX_SCREENSHOT_BYTES) {
      setScreenshotError(t('contactFeedback.screenshotTooLarge'));
      setScreenshotFile(null);
      setScreenshotPreview(null);
      return;
    }

    setScreenshotFile(file);
    const objectUrl = URL.createObjectURL(file);
    setScreenshotPreview(objectUrl);
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
    }
    setScreenshotPreview(null);
    setScreenshotError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFormSubmit = async () => {
    let screenshotKey: string | undefined;

    if (screenshotFile) {
      setUploadingScreenshot(true);
      try {
        const formData = new FormData();
        formData.append('file', screenshotFile);
        const uploadRes = await axios.post<{ key: string }>(`${API_URL}/feedback/screenshot`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        screenshotKey = uploadRes.data.key;
      } catch (err) {
        setScreenshotError(t('contactFeedback.screenshotUploadError'));
        setUploadingScreenshot(false);
        return;
      }
      setUploadingScreenshot(false);
    }

    handleSubmit(screenshotKey);
  };

  const isBusy = isSubmitting || uploadingScreenshot;

  return (
    <>
      <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, margin: 0 }}>
        {t('contactFeedback.description')}
      </p>

      {submitted ? (
        <div
          style={{
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.md,
            textAlign: 'center',
            color: theme.colors.text.primary,
          }}
        >
          ✅ {t('contactFeedback.submitSuccess')}
        </div>
      ) : (
        <>
          <div>
            <textarea
              value={message}
              onChange={event => setMessage(event.target.value)}
              placeholder={t('contactFeedback.placeholder')}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={6}
              disabled={isBusy}
              aria-label={t('contactFeedback.messagelabel')}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: theme.spacing.sm,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.primary,
                backgroundColor: theme.colors.background.paper,
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: theme.typography.lineHeight.relaxed,
              }}
            />
            <div
              style={{
                textAlign: 'right',
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
                marginTop: theme.spacing.xs,
              }}
            >
              {message.length} / {MAX_MESSAGE_LENGTH}
            </div>
          </div>

          {/* Screenshot upload */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.xs,
              }}
            >
              {t('contactFeedback.screenshotLabel')}
            </label>

            {screenshotPreview ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={screenshotPreview}
                  alt={t('contactFeedback.screenshotPreviewAlt')}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '160px',
                    borderRadius: theme.borderRadius.md,
                    border: `1px solid ${theme.colors.border.light}`,
                    display: 'block',
                  }}
                />
                <button
                  type="button"
                  onClick={removeScreenshot}
                  disabled={isBusy}
                  aria-label={t('contactFeedback.screenshotRemove')}
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    background: theme.colors.error.main,
                    color: theme.colors.common.white,
                    border: 'none',
                    borderRadius: '50%',
                    width: '22px',
                    height: '22px',
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                    fontSize: theme.typography.fontSize.xs,
                    lineHeight: '22px',
                    textAlign: 'center',
                    padding: 0,
                  }}
                >
                  {t('contactFeedback.screenshotRemoveIcon')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  border: `1px dashed ${theme.colors.border.light}`,
                  borderRadius: theme.borderRadius.md,
                  background: 'none',
                  color: theme.colors.text.secondary,
                  cursor: isBusy ? 'not-allowed' : 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                📎 {t('contactFeedback.screenshotAdd')}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              aria-hidden="true"
            />

            {screenshotError && (
              <p
                style={{
                  color: theme.colors.error.main,
                  fontSize: theme.typography.fontSize.xs,
                  margin: `${theme.spacing.xs} 0 0`,
                }}
              >
                {screenshotError}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={isBusy}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: theme.borderRadius.md,
                background: 'none',
                color: theme.colors.text.secondary,
                cursor: isBusy ? 'not-allowed' : 'pointer',
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleFormSubmit}
              disabled={isBusy || !message.trim()}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                border: 'none',
                borderRadius: theme.borderRadius.md,
                backgroundColor: theme.colors.primary.main,
                color: theme.colors.common.white,
                cursor: isBusy || !message.trim() ? 'not-allowed' : 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                opacity: isBusy || !message.trim() ? OPACITY_DISABLED : 1,
              }}
            >
              {(() => {
                if (uploadingScreenshot) {
                  return t('contactFeedback.screenshotUploading');
                }
                if (isSubmitting) {
                  return t('contactFeedback.submitting');
                }
                return t('contactFeedback.submit');
              })()}
            </button>
          </div>
        </>
      )}
    </>
  );
};
