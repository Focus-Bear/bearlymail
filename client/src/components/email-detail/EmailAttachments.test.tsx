import React from 'react';
import { render, screen } from '@testing-library/react';

import { EmailAttachments } from './EmailAttachments';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts?.count != null ? `${key}:${opts.count}` : key,
  }),
}));

vi.mock('axios');

const pdfAttachment = {
  attachmentId: 'att-pdf',
  filename: 'INVOICE.pdf',
  mimeType: 'application/pdf',
  size: 4096,
};

const imageAttachment = {
  attachmentId: 'att-img',
  filename: 'photo.png',
  mimeType: 'image/png',
  size: 1024,
};

describe('EmailAttachments', () => {
  it('shows a regular attachment with no contentId', () => {
    render(<EmailAttachments emailId="email-1" attachments={[pdfAttachment]} />);
    expect(screen.getByText('INVOICE.pdf')).toBeInTheDocument();
  });

  it('hides an inline image whose contentId is referenced by the body', () => {
    const inlineImage = { ...imageAttachment, contentId: 'img001@local' };
    const htmlBody = '<p>Hi</p><img src="cid:img001@local" />';
    render(<EmailAttachments emailId="email-1" attachments={[inlineImage]} htmlBody={htmlBody} />);
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
  });

  it('shows a real image attachment that carries a contentId but is NOT referenced in the body', () => {
    // Regression (issue): an email client can tag a genuine attachment (e.g. a screenshot)
    // with a Content-ID header even though it is not embedded via cid: in the body. The old
    // filter hid EVERY image-with-a-contentId, wrongly dropping this real attachment.
    const screenshot = {
      attachmentId: 'att-screenshot',
      filename: 'Screenshot 2026-08-04.png',
      mimeType: 'image/png',
      size: 200000,
      contentId: 'screenshot@mail',
    };
    const inlineImage = { ...imageAttachment, contentId: 'sig-logo@local' };
    // Body only references the inline signature image, NOT the screenshot.
    const htmlBody = '<p>See attached</p><img src="cid:sig-logo@local" />';
    render(<EmailAttachments emailId="email-1" attachments={[screenshot, inlineImage]} htmlBody={htmlBody} />);
    expect(screen.getByText('Screenshot 2026-08-04.png')).toBeInTheDocument();
    // The referenced signature image is still hidden.
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
  });

  it('shows an image attachment with a contentId when there is no body to reference it', () => {
    const imageWithContentId = { ...imageAttachment, contentId: 'img001@local' };
    render(<EmailAttachments emailId="email-1" attachments={[imageWithContentId]} />);
    expect(screen.getByText('photo.png')).toBeInTheDocument();
  });

  it('shows a non-image attachment even when it has a contentId referenced in the body', () => {
    // Non-image files are never embedded inline; a stray Content-ID must not hide them.
    const pdfWithContentId = { ...pdfAttachment, contentId: 'invoice@example.com' };
    const htmlBody = '<img src="cid:invoice@example.com" />';
    render(<EmailAttachments emailId="email-1" attachments={[pdfWithContentId]} htmlBody={htmlBody} />);
    expect(screen.getByText('INVOICE.pdf')).toBeInTheDocument();
  });

  it('shows an attachment with no contentId regardless of the body', () => {
    const htmlBody = '<img src="cid:something@else" />';
    render(<EmailAttachments emailId="email-1" attachments={[imageAttachment]} htmlBody={htmlBody} />);
    expect(screen.getByText('photo.png')).toBeInTheDocument();
  });

  it('matches referenced cid regardless of image MIME-type casing', () => {
    const inlineImage = { ...imageAttachment, mimeType: 'IMAGE/PNG', contentId: 'img001@local' };
    const htmlBody = '<img src="cid:img001@local" />';
    render(<EmailAttachments emailId="email-1" attachments={[inlineImage]} htmlBody={htmlBody} />);
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
  });

  it('returns null when the only attachment is a referenced inline image', () => {
    const inlineImage = { ...imageAttachment, contentId: 'img001@local' };
    const htmlBody = '<img src="cid:img001@local" />';
    const { container } = render(
      <EmailAttachments emailId="email-1" attachments={[inlineImage]} htmlBody={htmlBody} />
    );
    expect(container.firstChild).toBeNull();
  });
});
