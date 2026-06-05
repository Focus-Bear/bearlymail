/**
 * useAskAi — client state + transport for the "Ask AI" email assistant.
 *
 * Streams each question to the NestJS `/llm/ask-email/stream` endpoint over
 * Server-Sent Events so the UI can show live tool progress ("Searched your
 * emails", "Looked in Google Drive") before the final answer arrives. Nothing is
 * persisted: switching emails resets the conversation and cancels any in-flight
 * request. Auth rides on the session cookie (credentials: 'include').
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';

export const ASK_AI_ROLE_USER = 'user' as const;
export const ASK_AI_ROLE_ASSISTANT = 'assistant' as const;

const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_TOO_MANY_REQUESTS = 429;
const EVENT_TOOL = 'tool';
const EVENT_ANSWER = 'answer';
const EVENT_ERROR = 'error';
const ABORT_ERROR_NAME = 'AbortError';
const SSE_DELIMITER = '\n\n';

/** A tool the assistant used while answering (e.g. searched emails, Drive). */
export interface AskAiToolActivity {
  tool: string;
  label: string;
}

export interface AskAiMessage {
  role: typeof ASK_AI_ROLE_USER | typeof ASK_AI_ROLE_ASSISTANT;
  content: string;
  /** Tools the assistant used to produce this answer (assistant turns only). */
  toolActivity?: AskAiToolActivity[];
}

interface AskAiStreamEvent {
  type?: string;
  activity?: unknown;
  answer?: unknown;
  toolActivity?: unknown;
  message?: unknown;
}

/** Prior turns sent back to the server are capped to bound the prompt size. */
const MAX_HISTORY_TURNS = 12;

export interface UseAskAiReturn {
  messages: AskAiMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  hasError: boolean;
  /** Specific error message to show (e.g. "OpenAI not configured"); null = generic. */
  errorMessage: string | null;
  /** Tools used so far in the in-flight turn, shown live while loading. */
  liveActivity: AskAiToolActivity[];
  send: (question: string) => Promise<void>;
}

function isToolActivity(item: unknown): item is AskAiToolActivity {
  return (
    Boolean(item) &&
    typeof (item as AskAiToolActivity).tool === 'string' &&
    typeof (item as AskAiToolActivity).label === 'string'
  );
}

/** Map a non-OK HTTP response to a user-facing message (null = generic). */
async function messageForResponse(response: Response): Promise<string | null> {
  if (response.status === HTTP_TOO_MANY_REQUESTS) {
    return 'You’re sending questions too fast. Please wait a moment and try again.';
  }
  if (response.status === HTTP_SERVICE_UNAVAILABLE) {
    try {
      const payload: unknown = await response.json();
      const msg = (payload as { message?: string })?.message;
      if (typeof msg === 'string') {
        return msg;
      }
    } catch {
      // fall through to generic
    }
  }
  return null;
}

/** Read an SSE body, invoking `onEvent` for each parsed event until stale/done. */
async function readSseStream(
  response: Response,
  onEvent: (event: AskAiStreamEvent) => void,
  isStale: () => boolean
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  while (!finished) {
    const result = await reader.read();
    finished = result.done;
    if (result.value) {
      buffer += decoder.decode(result.value, { stream: true });
    }
    let boundary = buffer.indexOf(SSE_DELIMITER);
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + SSE_DELIMITER.length);
      boundary = buffer.indexOf(SSE_DELIMITER);
      const json = frame.startsWith('data:') ? frame.slice(5).trim() : frame;
      if (!json) {
        continue;
      }
      if (isStale()) {
        return;
      }
      try {
        onEvent(JSON.parse(json) as AskAiStreamEvent);
      } catch {
        // ignore malformed event frames
      }
    }
  }
}

export function useAskAi(emailId: string | undefined): UseAskAiReturn {
  const [messages, setMessages] = useState<AskAiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveActivity, setLiveActivity] = useState<AskAiToolActivity[]>([]);

  const messagesRef = useRef<AskAiMessage[]>(messages);
  messagesRef.current = messages;

  // Track the active emailId so in-flight responses for a previous email can be
  // discarded when the user switches to a different email mid-request.
  const emailIdRef = useRef(emailId);
  // The in-flight request controller, so we can cancel on email change/unmount.
  const abortRef = useRef<AbortController | null>(null);

  // Reset (and cancel any in-flight request) whenever the open email changes.
  useEffect(() => {
    emailIdRef.current = emailId;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setInput('');
    setHasError(false);
    setErrorMessage(null);
    setLiveActivity([]);
    setIsLoading(false);
  }, [emailId]);

  // Cancel any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleEvent = useCallback((event: AskAiStreamEvent) => {
    if (event.type === EVENT_TOOL && isToolActivity(event.activity)) {
      setLiveActivity(prev => [...prev, event.activity as AskAiToolActivity]);
    } else if (event.type === EVENT_ANSWER && typeof event.answer === 'string') {
      const activity = Array.isArray(event.toolActivity)
        ? (event.toolActivity as unknown[]).filter(isToolActivity)
        : [];
      setMessages(prev => [
        ...prev,
        {
          role: ASK_AI_ROLE_ASSISTANT,
          content: (event.answer as string).trim(),
          ...(activity.length > 0 ? { toolActivity: activity } : {}),
        },
      ]);
    } else if (event.type === EVENT_ERROR) {
      if (typeof event.message === 'string') {
        setErrorMessage(event.message);
      }
      setHasError(true);
    }
  }, []);

  const send = useCallback(
    async (questionText: string) => {
      const question = questionText.trim();
      if (!question || !emailId || isLoading) {
        return;
      }

      const requestEmailId = emailId;
      const priorTurns = messagesRef.current.slice(-MAX_HISTORY_TURNS);
      const controller = new AbortController();
      abortRef.current = controller;
      const isStale = () => emailIdRef.current !== requestEmailId;

      setHasError(false);
      setErrorMessage(null);
      setLiveActivity([]);
      setMessages(prev => [...prev, { role: ASK_AI_ROLE_USER, content: question }]);
      setInput('');
      setIsLoading(true);
      captureEvent(ANALYTICS_EVENTS.ASK_AI_QUESTION_SENT);

      try {
        const response = await fetch(`${API_URL}/llm/ask-email/stream`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailId: requestEmailId, question, history: priorTurns }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          if (!isStale()) {
            setErrorMessage(await messageForResponse(response));
            setHasError(true);
          }
          return;
        }

        await readSseStream(response, handleEvent, isStale);
      } catch (err) {
        if ((err as Error)?.name === ABORT_ERROR_NAME) {
          return;
        }
        if (!isStale()) {
          setHasError(true);
        }
      } finally {
        if (!isStale()) {
          setIsLoading(false);
          setLiveActivity([]);
        }
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [emailId, isLoading, handleEvent]
  );

  return { messages, input, setInput, isLoading, hasError, errorMessage, liveActivity, send };
}
