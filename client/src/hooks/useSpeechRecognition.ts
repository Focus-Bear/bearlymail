import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal structural types for the Web Speech API (`SpeechRecognition`), which
 * is not in the default TS DOM lib. Only the fields this hook touches are typed.
 */
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Thin React wrapper around the browser Web Speech API. Accumulates the
 * recognised transcript, tracks listening state, and surfaces errors so callers
 * can gracefully fall back when speech is unsupported or fails.
 */
export function useSpeechRecognition(lang = 'en-US'): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const isSupported = getSpeechRecognitionCtor() !== null;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('unsupported');
      return;
    }
    setError(null);
    setTranscript('');

    // Abort any previous session before starting a new one (e.g. on retry) so a
    // stale instance can't leak an active microphone / concurrent recognition.
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let text = '';
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i]?.[0]?.transcript ?? '';
      }
      setTranscript(text.trim());
    };
    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setError(event.error || 'error');
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      // Calling start() twice throws; treat as already-listening noise.
      setError('error');
      setIsListening(false);
    }
  }, [lang]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return { isSupported, isListening, transcript, error, start, stop, reset };
}
