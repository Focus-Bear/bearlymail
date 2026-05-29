import { useSearchParams } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';
import { Contact } from 'types/contact';

import { useComposeForm } from './useComposeForm';

vi.mock('react-router-dom', () => ({
  useSearchParams: vi.fn(),
}));

const mockUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;

describe('useComposeForm', () => {
  const mockSetSearchParams = vi.fn();
  const mockSearchParams = new URLSearchParams();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('to');
    mockSearchParams.delete('subject');
    mockUseSearchParams.mockReturnValue([mockSearchParams, mockSetSearchParams]);
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useComposeForm());

      expect(result.current.to).toEqual([]);
      expect(result.current.cc).toEqual([]);
      expect(result.current.bcc).toEqual([]);
      expect(result.current.subject).toBe('');
      expect(result.current.body).toBe('');
      expect(result.current.showCc).toBe(false);
      expect(result.current.showBcc).toBe(false);
    });

    it('should initialize with to parameter from URL', () => {
      mockSearchParams.set('to', 'test@example.com');
      mockUseSearchParams.mockReturnValue([mockSearchParams, mockSetSearchParams]);

      const { result } = renderHook(() => useComposeForm());

      expect(result.current.to).toEqual([{ email: 'test@example.com' }]);
    });

    it('should initialize with subject parameter from URL', () => {
      mockSearchParams.set('subject', 'Test Subject');
      mockUseSearchParams.mockReturnValue([mockSearchParams, mockSetSearchParams]);

      const { result } = renderHook(() => useComposeForm());

      expect(result.current.subject).toBe('Test Subject');
    });

    it('should initialize with both to and subject from URL', () => {
      mockSearchParams.set('to', 'test@example.com');
      mockSearchParams.set('subject', 'Test Subject');
      mockUseSearchParams.mockReturnValue([mockSearchParams, mockSetSearchParams]);

      const { result } = renderHook(() => useComposeForm());

      expect(result.current.to).toEqual([{ email: 'test@example.com' }]);
      expect(result.current.subject).toBe('Test Subject');
    });
  });

  describe('addRecipient', () => {
    it('should add recipient to to field', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.addRecipient({ email: 'test@example.com', name: 'Test User' }, 'to');
      });

      expect(result.current.to).toEqual([{ email: 'test@example.com', name: 'Test User' }]);
    });

    it('should add recipient to cc field', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.addRecipient({ email: 'cc@example.com' }, 'cc');
      });

      expect(result.current.cc).toEqual([{ email: 'cc@example.com' }]);
    });

    it('should add recipient to bcc field', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.addRecipient({ email: 'bcc@example.com' }, 'bcc');
      });

      expect(result.current.bcc).toEqual([{ email: 'bcc@example.com' }]);
    });

    it('should not add duplicate recipients', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.addRecipient({ email: 'test@example.com' }, 'to');
        result.current.addRecipient({ email: 'test@example.com' }, 'to');
      });

      expect(result.current.to).toHaveLength(1);
      expect(result.current.to[0].email).toBe('test@example.com');
    });

    it('should handle case-insensitive duplicate check', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.addRecipient({ email: 'Test@Example.com' }, 'to');
        result.current.addRecipient({ email: 'test@example.com' }, 'to');
      });

      expect(result.current.to).toHaveLength(1);
    });

    it('should handle Contact type with name', () => {
      const { result } = renderHook(() => useComposeForm());
      const contact: Contact = { email: 'test@example.com', name: 'Test User' };

      act(() => {
        result.current.addRecipient(contact, 'to');
      });

      expect(result.current.to[0]).toEqual({ email: 'test@example.com', name: 'Test User' });
    });

    it('should handle Contact type without name', () => {
      const { result } = renderHook(() => useComposeForm());
      const contact: Contact = { email: 'test@example.com' };

      act(() => {
        result.current.addRecipient(contact, 'to');
      });

      expect(result.current.to[0]).toEqual({ email: 'test@example.com' });
    });
  });

  describe('removeRecipient', () => {
    it('should remove recipient from to field', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.addRecipient({ email: 'test1@example.com' }, 'to');
        result.current.addRecipient({ email: 'test2@example.com' }, 'to');
        result.current.removeRecipient('test1@example.com', 'to');
      });

      expect(result.current.to).toHaveLength(1);
      expect(result.current.to[0].email).toBe('test2@example.com');
    });

    it('should remove recipient from cc field', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.addRecipient({ email: 'cc@example.com' }, 'cc');
        result.current.removeRecipient('cc@example.com', 'cc');
      });

      expect(result.current.cc).toHaveLength(0);
    });

    it('should remove recipient from bcc field', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.addRecipient({ email: 'bcc@example.com' }, 'bcc');
        result.current.removeRecipient('bcc@example.com', 'bcc');
      });

      expect(result.current.bcc).toHaveLength(0);
    });

    it('should handle removing non-existent recipient', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.addRecipient({ email: 'test@example.com' }, 'to');
        result.current.removeRecipient('nonexistent@example.com', 'to');
      });

      expect(result.current.to).toHaveLength(1);
    });
  });

  describe('state setters', () => {
    it('should update subject', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.setSubject('New Subject');
      });

      expect(result.current.subject).toBe('New Subject');
    });

    it('should update body', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.setBody('Email body content');
      });

      expect(result.current.body).toBe('Email body content');
    });

    it('should toggle showCc', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.setShowCc(true);
      });

      expect(result.current.showCc).toBe(true);

      act(() => {
        result.current.setShowCc(false);
      });

      expect(result.current.showCc).toBe(false);
    });

    it('should toggle showBcc', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.setShowBcc(true);
      });

      expect(result.current.showBcc).toBe(true);

      act(() => {
        result.current.setShowBcc(false);
      });

      expect(result.current.showBcc).toBe(false);
    });

    it('should update to array directly', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.setTo([{ email: 'direct@example.com' }]);
      });

      expect(result.current.to).toEqual([{ email: 'direct@example.com' }]);
    });

    it('should update cc array directly', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.setCc([{ email: 'cc@example.com' }]);
      });

      expect(result.current.cc).toEqual([{ email: 'cc@example.com' }]);
    });

    it('should update bcc array directly', () => {
      const { result } = renderHook(() => useComposeForm());

      act(() => {
        result.current.setBcc([{ email: 'bcc@example.com' }]);
      });

      expect(result.current.bcc).toEqual([{ email: 'bcc@example.com' }]);
    });
  });
});
