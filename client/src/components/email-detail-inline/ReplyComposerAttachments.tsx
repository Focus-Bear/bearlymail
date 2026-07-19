import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ReplyComposerAttachmentsProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
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
 * Reply composer attachments component
 * Allows users to attach files to their reply
 */
export const ReplyComposerAttachments: React.FC<ReplyComposerAttachmentsProps> = ({ files, onFilesChange }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length > 0) {
      onFilesChange([...files, ...selectedFiles]);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    onFilesChange(newFiles);
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileSelect} />

      <button
        type="button"
        onClick={handleAttachClick}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.primary.main,
          border: `1px solid ${theme.colors.primary.light}`,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        <span>📎</span>
        <span>{t('emailDetail.attachFiles')}</span>
      </button>

      {files.length > 0 && (
        <div style={{ marginTop: theme.spacing.sm, display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
          {files.map((file, index) => (
            <AttachmentFileItem key={file.name} file={file} onRemove={() => handleRemoveFile(index)} />
          ))}
        </div>
      )}
    </div>
  );
};

const AttachmentFileItem: React.FC<{ file: File; onRemove: () => void }> = ({ file, onRemove }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.xs,
        backgroundColor: theme.colors.background.default,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      <span>📎</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: theme.colors.text.primary,
          }}
        >
          {file.name}
        </div>
        <div
          style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
            marginTop: theme.spacing.xs,
          }}
        >
          {formatFileSize(file.size)}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.xs}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
        onMouseEnter={event => {
          event.currentTarget.style.color = theme.colors.error.main;
        }}
        onMouseLeave={event => {
          event.currentTarget.style.color = theme.colors.text.secondary;
        }}
        aria-label={t('common.remove')}
      >
        {'\u2715'}
      </button>
    </div>
  );
};
