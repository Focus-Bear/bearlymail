/**
 * The sender sets an attachment's MIME type, and a preview is a blob URL on
 * the app's own origin, so anything a browser would render as a document
 * (HTML, XHTML, SVG, `application/pdf+xml`, ...) would run script as the user.
 * Only these exact raster image types and PDF are previewed, and the blob is
 * always built with the canonical type returned here, never the sender's.
 */
const LEGACY_JPEG_TYPE = 'image/jpg';
const JPEG_TYPE = 'image/jpeg';

export const PREVIEW_KIND_IMAGE = 'image';
export const PREVIEW_KIND_PDF = 'pdf';
type PreviewKind = typeof PREVIEW_KIND_IMAGE | typeof PREVIEW_KIND_PDF;

const PREVIEWABLE_TYPES: Readonly<Record<string, PreviewKind>> = {
  'image/png': PREVIEW_KIND_IMAGE,
  'image/jpeg': PREVIEW_KIND_IMAGE,
  'image/jpg': PREVIEW_KIND_IMAGE,
  'image/gif': PREVIEW_KIND_IMAGE,
  'image/webp': PREVIEW_KIND_IMAGE,
  'image/bmp': PREVIEW_KIND_IMAGE,
  'application/pdf': PREVIEW_KIND_PDF,
};

export interface AttachmentPreviewType {
  kind: PreviewKind;
  /** Safe MIME type to give the preview blob. */
  blobType: string;
}

/** How to preview an attachment, or null when it must only be downloaded. */
export function getAttachmentPreviewType(mimeType: string | null | undefined): AttachmentPreviewType | null {
  const essence = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  const kind = PREVIEWABLE_TYPES[essence];
  return kind ? { kind, blobType: essence === LEGACY_JPEG_TYPE ? JPEG_TYPE : essence } : null;
}
