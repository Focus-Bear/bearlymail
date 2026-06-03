/**
 * useAskAi — client state + transport for the "Ask AI" email assistant.
 *
 * Holds the in-memory conversation for the currently-open email and posts each
 * question (plus prior turns) to the NestJS `/llm/ask-email` endpoint. Nothing
 * is persisted: switching emails resets the conversation.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';

export const ASK_AI_ROLE_USER = 'user' as const;
export const ASK_AI_ROLE_ASSISTANT = 'assistant' as const;

export interface AskAiMessage {
  role: typeof ASK_AI_ROLE_USER | typeof ASK_AI_ROLE_ASSISTANT;
  content: string;
}

/** Prior turns sent back to the server are capped to bound the prompt size. */
const MAX_HISTORY_TURNS = 12;

export interface UseAskAiReturn {
  messages: AskAiMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  hasError: boolean;
  send: (question: string) => Promise<void>;
}

export function useAskAi(emailId: string | undefined): UseAskAiReturn {
  const [messages, setMessages] = useState<AskAiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Keep a ref to the current conversation so `send` can read the latest turns
  // without being recreated on every message (avoids stale-closure history).
  const messagesRef = useRef<AskAiMessage[]>(messages);
  messagesRef.current = messages;

  // Track the active emailId so in-flight responses for a previous email can be
  // discarded when the user switches to a different email mid-request.
  const emailIdRef = useRef(emailId);

  // Reset the conversation whenever the open email changes.
  useEffect(() => {
    emailIdRef.current = emailId;
    setMessages([]);
    setInput('');
    setHasError(false);
    setIsLoading(false);
  }, [emailId]);

  const send = useCallback(
    async (questionText: string) => {
      const question = questionText.trim();
      if (!question || !emailId || isLoading) {
        return;
      }

      const requestEmailId = emailId;
      const priorTurns = messagesRef.current.slice(-MAX_HISTORY_TURNS);
      setHasError(false);
      setMessages(prev => [...prev, { role: ASK_AI_ROLE_USER, content: question }]);
      setInput('');
      setIsLoading(true);
      captureEvent(ANALYTICS_EVENTS.ASK_AI_QUESTION_SENT);

      try {
        const response = await axios.post(`${API_URL}/llm/ask-email`, {
          emailId: requestEmailId,
          question,
          history: priorTurns,
        });
        if (emailIdRef.current !== requestEmailId) {
          return;
        }
        const answer: unknown = response.data?.answer;
        if (typeof answer === 'string' && answer.trim().length > 0) {
          setMessages(prev => [...prev, { role: ASK_AI_ROLE_ASSISTANT, content: answer.trim() }]);
        } else {
          setHasError(true);
        }
      } catch {
        if (emailIdRef.current === requestEmailId) {
          setHasError(true);
        }
      } finally {
        if (emailIdRef.current === requestEmailId) {
          setIsLoading(false);
        }
      }
    },
    [emailId, isLoading]
  );

  return { messages, input, setInput, isLoading, hasError, send };
}
