import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { AttachmentPreviewModal } from './AttachmentPreviewModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts?.filename ? `${key}:${opts.filename}` : key) }),
}));

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const createObjectURLMock = vi.fn(() => 'blob:mock-url');
const revokeObjectURLMock = vi.fn();
Object.defineProperty(window, 'URL', {
  value: { createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock },
  writable: true,
});

const imageAttachment = {
  attachmentId: 'att-1',
  filename: 'photo.png',
  mimeType: 'image/png',
  size: 1024,
};

const pdfAttachment = {
  attachmentId: 'att-2',
  filename: 'document.pdf',
  mimeType: 'application/pdf',
  size: 2048,
};

const defaultProps = {
  emailId: 'email-1',
  attachment: imageAttachment,
  onClose: vi.fn(),
  onDownload: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Re-stub atob after clearAllMocks, which resets mock return values
  global.atob = vi.fn(() => 'A');
  createObjectURLMock.mockReturnValue('blob:mock-url');
  mockedAxios.get.mockResolvedValue({
    data: { base64Content: 'QQ==', mimeType: 'image/png' },
  });
});

describe('AttachmentPreviewModal', () => {
  it('shows loading state initially', () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}));
    render(<AttachmentPreviewModal {...defaultProps} />);
    expect(screen.getByText('emailDetail.previewLoading')).toBeInTheDocument();
  });

  it('renders image after successful fetch', async () => {
    render(<AttachmentPreviewModal {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByAltText('photo.png')).toBeInTheDocument();
    });
  });

  it('renders an iframe for PDF attachments', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { base64Content: 'QQ==', mimeType: 'application/pdf' },
    });
    render(<AttachmentPreviewModal {...defaultProps} attachment={pdfAttachment} />);
    await waitFor(() => {
      expect(screen.getByTitle('document.pdf')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network error'));
    render(<AttachmentPreviewModal {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('emailDetail.previewLoadError')).toBeInTheDocument();
    });
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<AttachmentPreviewModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay background is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<AttachmentPreviewModal {...defaultProps} onClose={onClose} />);
    const overlay = container.firstChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onDownload when download button is clicked', async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(<AttachmentPreviewModal {...defaultProps} onDownload={onDownload} />);
    await waitFor(() => screen.getByAltText('photo.png'));
    fireEvent.click(screen.getByLabelText('emailDetail.downloadAttachment'));
    await waitFor(() => {
      expect(onDownload).toHaveBeenCalledWith('email-1', 'att-1', 'photo.png');
    });
  });

  it('revokes blob URL on unmount', async () => {
    const { unmount } = render(<AttachmentPreviewModal {...defaultProps} />);
    await waitFor(() => screen.getByAltText('photo.png'));
    unmount();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });
});
