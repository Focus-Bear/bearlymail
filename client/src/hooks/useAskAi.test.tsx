/**
 * Tests for useAskAi — verifies the streaming Ask AI transport: it reads SSE
 * "tool" events into live activity and the final "answer" event into a message.
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useAskAi } from './useAskAi';

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

/** Build a fetch Response whose body streams the given SSE event objects. */
function sseResponse(events: unknown[], ok = true, status = 200): Response {
  const encoder = new TextEncoder();
  const frames = events.map(evt => encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
  let i = 0;
  const body = {
    getReader: () => ({
      read: () =>
        i < frames.length
          ? Promise.resolve({ value: frames[i++], done: false })
          : Promise.resolve({ value: undefined, done: true }),
    }),
  };
  return { ok, status, body, json: () => Promise.resolve({}) } as unknown as Response;
}

describe('useAskAi (streaming)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams tool events then the final answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { type: 'tool', activity: { tool: 'search_emails', label: 'Searched your emails' } },
          {
            type: 'answer',
            answer: 'Found 2 earlier emails.',
            toolActivity: [{ tool: 'search_emails', label: 'Searched your emails' }],
          },
        ])
      )
    );

    const { result } = renderHook(() => useAskAi('email-1'));
    await act(async () => {
      await result.current.send('Any other emails from this sender?');
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    const last = result.current.messages[1];
    expect(last.content).toContain('earlier emails');
    expect(last.toolActivity).toEqual([{ tool: 'search_emails', label: 'Searched your emails' }]);
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces an in-stream error event message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([{ type: 'error', message: 'OpenAI is not configured.' }]))
    );

    const { result } = renderHook(() => useAskAi('email-1'));
    await act(async () => {
      await result.current.send('hi');
    });

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.errorMessage).toBe('OpenAI is not configured.');
  });

  it('maps a 429 response to a rate-limit message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([], false, 429)));

    const { result } = renderHook(() => useAskAi('email-1'));
    await act(async () => {
      await result.current.send('hi');
    });

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.errorMessage).toMatch(/too fast/i);
  });

  describe('tool approval', () => {
    const PENDING = {
      approvalId: 'approval-1',
      serverName: 'Google Drive',
      toolName: 'share_file',
      arguments: { fileId: 'f1' },
      argumentsHash: 'a'.repeat(64),
      expiresAt: '2026-11-13T10:00:00.000Z',
    };

    it('exposes a pending tool call and sends the decision bound to its id and hash', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(sseResponse([{ type: 'approval_required', pendingToolCall: PENDING, toolActivity: [] }]))
        .mockResolvedValueOnce(
          sseResponse([
            {
              type: 'answer',
              answer: 'Shared it.',
              toolActivity: [{ tool: 'share_file', label: 'Looked in Google Drive' }],
            },
          ])
        );
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useAskAi('email-1'));
      await act(async () => {
        await result.current.send('Share the deck');
      });

      await waitFor(() => expect(result.current.pendingToolCall).toEqual(PENDING));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages).toHaveLength(1);

      await act(async () => {
        await result.current.decideToolCall(true);
      });

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toContain('/llm/ask-email/tool-approval/stream');
      expect(JSON.parse(init.body)).toEqual({
        approvalId: 'approval-1',
        argumentsHash: PENDING.argumentsHash,
        approved: true,
      });
      await waitFor(() => expect(result.current.messages).toHaveLength(2));
      expect(result.current.messages[1].content).toBe('Shared it.');
      expect(result.current.pendingToolCall).toBeNull();
    });

    it('sends a denial and shows a clear message when the approval is gone', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(sseResponse([{ type: 'approval_required', pendingToolCall: PENDING, toolActivity: [] }]))
        .mockResolvedValueOnce(sseResponse([], false, 410));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useAskAi('email-1'));
      await act(async () => {
        await result.current.send('Share the deck');
      });
      await waitFor(() => expect(result.current.pendingToolCall).not.toBeNull());

      await act(async () => {
        await result.current.decideToolCall(false);
      });

      expect(JSON.parse(fetchMock.mock.calls[1][1].body).approved).toBe(false);
      await waitFor(() => expect(result.current.hasError).toBe(true));
      expect(result.current.errorMessage).toBe('inbox.askAi.approval.unavailable');
    });

    it('ignores new questions while a decision is pending', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          sseResponse([{ type: 'approval_required', pendingToolCall: PENDING, toolActivity: [] }])
        );
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useAskAi('email-1'));
      await act(async () => {
        await result.current.send('Share the deck');
      });
      await waitFor(() => expect(result.current.pendingToolCall).not.toBeNull());

      await act(async () => {
        await result.current.send('Something else');
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
