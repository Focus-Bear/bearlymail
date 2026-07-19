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

  it('hides an inline image that has a contentId', () => {
    const inlineImage = { ...imageAttachment, contentId: 'img001@local' };
    render(<EmailAttachments emailId="email-1" attachments={[inlineImage]} />);
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
  });

  it('shows a PDF attachment even when it has a contentId (not an inline image)', () => {
    // Some email clients add Content-ID headers to all attachments, including PDFs.
    // PDFs are never embedded inline via cid: references, so they must still be shown.
    const pdfWithContentId = { ...pdfAttachment, contentId: 'invoice@example.com' };
    render(<EmailAttachments emailId="email-1" attachments={[pdfWithContentId]} />);
    expect(screen.getByText('INVOICE.pdf')).toBeInTheDocument();
  });

  it('shows non-image attachments with contentId alongside inline images', () => {
    const inlineImage = { ...imageAttachment, contentId: 'img001@local' };
    const pdfWithContentId = { ...pdfAttachment, contentId: 'invoice@example.com' };
    render(<EmailAttachments emailId="email-1" attachments={[inlineImage, pdfWithContentId]} />);
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
    expect(screen.getByText('INVOICE.pdf')).toBeInTheDocument();
  });

  it('hides an inline image whose MIME type is uppercase (case-insensitive match)', () => {
    const inlineImage = { ...imageAttachment, mimeType: 'IMAGE/PNG', contentId: 'img001@local' };
    render(<EmailAttachments emailId="email-1" attachments={[inlineImage]} />);
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
  });

  it('returns null when all attachments are inline images', () => {
    const inlineImage = { ...imageAttachment, contentId: 'img001@local' };
    const { container } = render(<EmailAttachments emailId="email-1" attachments={[inlineImage]} />);
    expect(container.firstChild).toBeNull();
  });
});
