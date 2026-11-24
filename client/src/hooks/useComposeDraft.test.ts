import { useSearchParams } from 'react-router-dom';
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { COMPOSE_DRAFT_ID_PARAM, DRAFTS_ENDPOINT } from 'constants/drafts';

import { ComposeDraftTarget, useComposeDraft } from './useComposeDraft';

vi.mock('axios');
vi.mock('react-router-dom', () => ({
  useSearchParams: vi.fn(),
}));

const mockUseSearchParams = useSearchParams as unknown as ReturnType<typeof vi.fn>;
const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

const DRAFT_ID = '33333333-3333-4333-8333-333333333333';
const DRAFT_URL = `${API_URL}${DRAFTS_ENDPOINT}/${DRAFT_ID}`;

function makeTarget(): ComposeDraftTarget {
  return {
    setTo: vi.fn(),
    setCc: vi.fn(),
    setBcc: vi.fn(),
    setShowCc: vi.fn(),
    setShowBcc: vi.fn(),
    setSubject: vi.fn(),
    setBody: vi.fn(),
    setAttachments: vi.fn(),
  };
}

function openWith(params: Record<string, string>) {
  mockUseSearchParams.mockReturnValue([new URLSearchParams(params), vi.fn()]);
}

describe('useComposeDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing without a draft id', async () => {
    openWith({});
    const target = makeTarget();
    const { result } = renderHook(() => useComposeDraft(target, vi.fn()));

    await result.current.discardSentDraft();

    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.delete).not.toHaveBeenCalled();
  });

  it('fills the form from a saved draft, attachments included', async () => {
    openWith({ [COMPOSE_DRAFT_ID_PARAM]: DRAFT_ID });
    mockedAxios.get.mockResolvedValue({
      data: {
        id: DRAFT_ID,
        emailThreadId: null,
        content: '<p>Please find the PO attached.</p>',
        recipients: 'supplier@example.com, sales@example.com',
        subject: 'Purchase order 42',
        cc: 'accounts@example.com',
        bcc: null,
        attachments: [{ filename: 'po.pdf', mimeType: 'application/pdf', content: btoa('%PDF-1.4') }],
      },
    });
    const target = makeTarget();

    renderHook(() => useComposeDraft(target, vi.fn()));

    await waitFor(() => expect(target.setBody).toHaveBeenCalledWith('<p>Please find the PO attached.</p>'));
    expect(mockedAxios.get).toHaveBeenCalledWith(DRAFT_URL);
    expect(target.setTo).toHaveBeenCalledWith([{ email: 'supplier@example.com' }, { email: 'sales@example.com' }]);
    expect(target.setCc).toHaveBeenCalledWith([{ email: 'accounts@example.com' }]);
    expect(target.setShowCc).toHaveBeenCalledWith(true);
    expect(target.setBcc).toHaveBeenCalledWith([]);
    expect(target.setShowBcc).toHaveBeenCalledWith(false);
    expect(target.setSubject).toHaveBeenCalledWith('Purchase order 42');
    const [files] = (target.setAttachments as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('po.pdf');
    expect(await files[0].text()).toBe('%PDF-1.4');
  });

  it('reports a draft that cannot be loaded', async () => {
    openWith({ [COMPOSE_DRAFT_ID_PARAM]: DRAFT_ID });
    mockedAxios.get.mockRejectedValue(new Error('404'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onLoadFailed = vi.fn();

    renderHook(() => useComposeDraft(makeTarget(), onLoadFailed));

    await waitFor(() => expect(onLoadFailed).toHaveBeenCalled());
  });

  it('deletes the draft once its message is sent', async () => {
    openWith({ [COMPOSE_DRAFT_ID_PARAM]: DRAFT_ID });
    mockedAxios.get.mockResolvedValue({ data: { id: DRAFT_ID, content: '', recipients: null } });
    mockedAxios.delete.mockResolvedValue({});
    const { result } = renderHook(() => useComposeDraft(makeTarget(), vi.fn()));

    await result.current.discardSentDraft();

    expect(mockedAxios.delete).toHaveBeenCalledWith(DRAFT_URL);
  });
});
