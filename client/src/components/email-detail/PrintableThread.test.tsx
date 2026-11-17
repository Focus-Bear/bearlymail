import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Email } from 'types/email';

import { PrintableThread } from './PrintableThread';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const PRINT_CONTAINER_SELECTOR = '#printable-email-thread';

const email = {
  id: 'email-1',
  subject: 'Quarterly report',
  from: 'sender@example.com',
  to: 'me@example.com',
  body: 'Plain body',
  htmlBody:
    '<style>body { background: red; }</style><div id="root" class="app" style="color: blue; background-image: url(https://x.test/p.gif)">Report body</div>',
  receivedAt: '2026-01-01T00:00:00.000Z',
} as Email;

function firePrintEvent(type: 'beforeprint' | 'afterprint') {
  act(() => {
    window.dispatchEvent(new Event(type));
  });
}

describe('PrintableThread', () => {
  it('renders nothing outside of printing', () => {
    const { container } = render(<PrintableThread email={email} threadEmails={[]} />);
    expect(container.querySelector(PRINT_CONTAINER_SELECTOR)).toBeNull();
    expect(screen.queryByText('Report body')).toBeNull();
  });

  it('mounts the printable copy on beforeprint and removes it on afterprint', () => {
    const { container } = render(<PrintableThread email={email} threadEmails={[]} />);

    firePrintEvent('beforeprint');
    expect(container.querySelector(PRINT_CONTAINER_SELECTOR)).not.toBeNull();
    expect(screen.getByText('Quarterly report')).toBeInTheDocument();
    expect(screen.getByText('Report body')).toBeInTheDocument();

    firePrintEvent('afterprint');
    expect(container.querySelector(PRINT_CONTAINER_SELECTOR)).toBeNull();
  });

  it('does not carry message CSS into the document while printing', () => {
    const { container } = render(<PrintableThread email={email} threadEmails={[]} />);
    firePrintEvent('beforeprint');

    const body = container.querySelector('.print-message-body') as HTMLElement;
    expect(body.querySelector('style')).toBeNull();
    expect(body.querySelector('[id]')).toBeNull();
    expect(body.querySelector('[class]')).toBeNull();
    expect(body.innerHTML).not.toMatch(/url\(/i);
    expect(document.querySelectorAll('#root')).toHaveLength(0);

    firePrintEvent('afterprint');
  });

  it('prints every message in the thread', () => {
    const second = { ...email, id: 'email-2', htmlBody: '<p>Second message</p>' } as Email;
    render(<PrintableThread email={email} threadEmails={[email, second]} />);
    firePrintEvent('beforeprint');
    expect(screen.getByText('Report body')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
    firePrintEvent('afterprint');
  });
});
