/**
 * Tests for useAskAi — verifies the streaming Ask AI transport: it reads SSE
 * "tool" events into live activity and the final "answer" event into a message.
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useAskAi } from './useAskAi';

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

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
      vi.fn().mockResolvedValue(
        sseResponse([{ type: 'error', message: 'OpenAI is not configured.' }])
      )
    );

    const { result } = renderHook(() => useAskAi('email-1'));
    await act(async () => {
      await result.current.send('hi');
    });

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.errorMessage).toBe('OpenAI is not configured.');
  });

  it('maps a 429 response to a rate-limit message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([], false, 429))
    );

    const { result } = renderHook(() => useAskAi('email-1'));
    await act(async () => {
      await result.current.send('hi');
    });

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.errorMessage).toMatch(/too fast/i);
  });
});
