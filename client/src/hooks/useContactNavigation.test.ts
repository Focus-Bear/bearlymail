import { renderHook } from '@testing-library/react';

import { useContactNavigation } from './useContactNavigation';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const makeEvent = () => ({ stopPropagation: vi.fn(), preventDefault: vi.fn() }) as unknown as React.SyntheticEvent;

describe('useContactNavigation', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockNavigate.mockReset();
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('navigates in place to a pre-resolved contact by default', async () => {
    const { result } = renderHook(() => useContactNavigation());

    await result.current.navigateToContact(makeEvent(), 'a@b.com', 'contact-1');

    expect(mockNavigate).toHaveBeenCalledWith('/crm/contacts/contact-1');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('opens the contact in a new tab when newTab is set', async () => {
    const { result } = renderHook(() => useContactNavigation());

    await result.current.navigateToContact(makeEvent(), 'a@b.com', 'contact-1', { newTab: true });

    expect(openSpy).toHaveBeenCalledWith('/crm/contacts/contact-1', '_blank', 'noopener,noreferrer');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('stops propagation so the click does not also select the email row', async () => {
    const { result } = renderHook(() => useContactNavigation());
    const event = makeEvent();

    await result.current.navigateToContact(event, 'a@b.com', 'contact-1', { newTab: true });

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
