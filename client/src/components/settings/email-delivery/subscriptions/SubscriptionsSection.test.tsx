import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

import { UNSUBSCRIBE_METHODS, UNSUBSCRIBE_OUTCOMES } from 'constants/unsubscribe';

import { MailingList } from './mailingLists.api';
import { SubscriptionsSection } from './SubscriptionsSection';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

const list = (overrides: Partial<MailingList>): MailingList => ({
  emailId: 'e1',
  name: 'Paragon',
  address: 'news@paragon.test',
  emailCount: 12,
  triageThreadCount: 3,
  lastReceivedAt: '2026-11-23T00:00:00.000Z',
  perWeek: 3,
  method: UNSUBSCRIBE_METHODS.ONE_CLICK,
  ...overrides,
});

const ONE_CLICK = list({ emailId: 'e1' });
const MAILTO = list({ emailId: 'e2', name: 'Weekly Deals', address: 'deals@shop.test', method: UNSUBSCRIBE_METHODS.MAILTO });
const WEBSITE = list({ emailId: 'e3', name: null, address: 'hello@blog.test', method: UNSUBSCRIBE_METHODS.LINK });

let unsubscribeReplies: Record<string, { outcome: string; url?: string } | Error>;

function mockServer(lists: MailingList[]) {
  mockedAxios.get.mockResolvedValue({ data: { mailingLists: lists } });
  mockedAxios.post.mockImplementation(async (url: string) => {
    const emailId = url.split('/emails/')[1].split('/')[0];
    if (url.endsWith('/archive-sender')) {
return { data: { archivedCount: 2 } };
}
    const reply = unsubscribeReplies[emailId];
    if (reply instanceof Error) {
throw reply;
}
    return { data: { ...reply, method: 'x' } };
  });
}

async function openSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /settings\.subscriptions\.title/ }));
}

describe('SubscriptionsSection', () => {
  beforeEach(() => {
    unsubscribeReplies = {
      e1: { outcome: UNSUBSCRIBE_OUTCOMES.UNSUBSCRIBED },
      e2: { outcome: UNSUBSCRIBE_OUTCOMES.UNSUBSCRIBED },
      e3: { outcome: UNSUBSCRIBE_OUTCOMES.OPEN_LINK, url: 'https://blog.test/unsubscribe?t=1' },
    };
    mockServer([ONE_CLICK, MAILTO, WEBSITE]);
  });

  it('loads the mailing lists only when opened, busiest first with how they unsubscribe', async () => {
    const user = userEvent.setup();
    render(<SubscriptionsSection />);
    expect(mockedAxios.get).not.toHaveBeenCalled();

    await openSection(user);

    expect(await screen.findByLabelText(/Paragon/)).toBeInTheDocument();
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/mailing-lists'));
    expect(screen.getByText('settings.subscriptions.method.mailto')).toBeInTheDocument();
    expect(screen.getByText('settings.subscriptions.method.link')).toBeInTheDocument();
  });

  it('lists the senders that will get an email from the account before anything runs, and Cancel does nothing', async () => {
    const user = userEvent.setup();
    render(<SubscriptionsSection />);
    await openSection(user);
    await user.click(await screen.findByLabelText(/Weekly Deals/));
    await user.click(screen.getByRole('button', { name: /cleanupButton/ }));

    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText('Weekly Deals (deals@shop.test)')).toBeInTheDocument();
    expect(within(confirm).getByRole('note')).toHaveTextContent('settings.subscriptions.confirm.blockWarningTitle');

    await user.click(within(confirm).getByRole('button', { name: 'settings.subscriptions.confirm.cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('unsubscribes and archives each ticked sender with the method shown, then reports links to finish', async () => {
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<SubscriptionsSection onChanged={onChanged} />);
    await openSection(user);
    await user.click(await screen.findByLabelText(/settings\.subscriptions\.selectAll/));
    await user.click(screen.getByRole('button', { name: /cleanupButton/ }));
    await user.click(screen.getByRole('button', { name: 'settings.subscriptions.confirm.confirm' }));

    const result = await screen.findByRole('status');
    expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/emails/e2/unsubscribe'), {
      method: UNSUBSCRIBE_METHODS.MAILTO,
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/emails/e1/unsubscribe/archive-sender'), {
      includeThisThread: true,
    });
    expect(within(result).getByText(/result\.unsubscribed.*"count":2/)).toBeInTheDocument();
    expect(within(result).getByText(/result\.archived.*"count":6/)).toBeInTheDocument();
    const link = within(result).getByRole('link', { name: /hello@blog\.test/ });
    expect(link).toHaveAttribute('href', 'https://blog.test/unsubscribe?t=1');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledTimes(2));
  });

  it('still archives a sender whose unsubscribe fails, lists it as failed, and never links to a non-https page', async () => {
    unsubscribeReplies.e1 = new Error('boom');
    unsubscribeReplies.e3 = { outcome: UNSUBSCRIBE_OUTCOMES.OPEN_LINK, url: 'http://blog.test/unsub' };
    const user = userEvent.setup();
    render(<SubscriptionsSection />);
    await openSection(user);
    await user.click(await screen.findByLabelText(/settings\.subscriptions\.selectAll/));
    await user.click(screen.getByRole('button', { name: /cleanupButton/ }));
    await user.click(screen.getByRole('button', { name: 'settings.subscriptions.confirm.confirm' }));

    const result = await screen.findByRole('status');
    expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/emails/e1/unsubscribe/archive-sender'), {
      includeThisThread: true,
    });
    expect(within(result).getByText('settings.subscriptions.result.failed')).toBeInTheDocument();
    expect(within(result).getByText('Paragon')).toBeInTheDocument();
    expect(within(result).getByText('hello@blog.test')).toBeInTheDocument();
    expect(within(result).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no mailing lists', async () => {
    mockServer([]);
    const user = userEvent.setup();
    render(<SubscriptionsSection />);
    await openSection(user);

    expect(await screen.findByText('settings.subscriptions.emptyState')).toBeInTheDocument();
  });
});
