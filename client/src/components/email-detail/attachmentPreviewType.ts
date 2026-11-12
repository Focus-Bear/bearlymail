/**
 * The sender sets an attachment's MIME type, and a preview is a blob URL on
 * the app's own origin, so anything a browser would render as a document
 * (HTML, XHTML, SVG, `application/pdf+xml`, ...) would run script as the user.
 * Only these exact raster image types and PDF are previewed, and the blob is
 * always built with the canonical type returned here, never the sender's.
 */
const LEGACY_JPEG_TYPE = 'image/jpg';
const JPEG_TYPE = 'image/jpeg';

const PREVIEWABLE_TYPES: Readonly<Record<string, 'image' | 'pdf'>> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/bmp': 'image',
  'application/pdf': 'pdf',
};

export interface AttachmentPreviewType {
  kind: 'image' | 'pdf';
  /** Safe MIME type to give the preview blob. */
  blobType: string;
}

/** How to preview an attachment, or null when it must only be downloaded. */
export function getAttachmentPreviewType(mimeType: string | null | undefined): AttachmentPreviewType | null {
  const essence = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  const kind = PREVIEWABLE_TYPES[essence];
  return kind ? { kind, blobType: essence === LEGACY_JPEG_TYPE ? JPEG_TYPE : essence } : null;
}
