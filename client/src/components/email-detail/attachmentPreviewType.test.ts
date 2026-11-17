import { getAttachmentPreviewType } from './attachmentPreviewType';

describe('getAttachmentPreviewType', () => {
  it.each([
    'application/pdf+xml',
    'application/xhtml+xml',
    'text/html',
    'image/svg+xml',
    'application/x-pdf-html',
    'text/xml; charset=pdf',
    '',
  ])('refuses to preview %s', (mimeType) => {
    expect(getAttachmentPreviewType(mimeType)).toBeNull();
  });

  it('previews PDFs and raster images with a canonical blob type', () => {
    expect(getAttachmentPreviewType('Application/PDF; name="a.pdf"')).toEqual({
      kind: 'pdf',
      blobType: 'application/pdf',
    });
    expect(getAttachmentPreviewType('image/jpg')).toEqual({ kind: 'image', blobType: 'image/jpeg' });
    expect(getAttachmentPreviewType('image/png')).toEqual({ kind: 'image', blobType: 'image/png' });
  });
});
