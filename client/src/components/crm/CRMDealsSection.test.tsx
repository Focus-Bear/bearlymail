import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { CRMDealsSection } from './CRMDealsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const SENDER_EMAIL = 'person@example.com';
const SENDER_CONTACT = { id: 'contact-1', email: SENDER_EMAIL, name: 'Pat Person' };
const STAGES = [
  { id: 'stage-lead', name: 'Lead', sortOrder: 0, color: null, isWon: false, isLost: false },
  { id: 'stage-won', name: 'Won', sortOrder: 1, color: null, isWon: true, isLost: false },
];
const OTHER_CONTACTS = [{ id: 'contact-2', email: 'other@example.com', name: 'Olive Other' }];

const STAGES_PATH = '/deals/stages';
const CONTACTS_PATH = '/contacts';
const DEALS_PATH = '/deals';

/** A request that has been sent but not answered — the slow network the form must not wait for. */
interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
}

const respondToGet = (url: string) => {
  if (url.endsWith(STAGES_PATH)) {
    return Promise.resolve({ data: STAGES });
  }
  if (url.endsWith(CONTACTS_PATH)) {
    return Promise.resolve({ data: OTHER_CONTACTS });
  }
  return Promise.resolve({ data: [] });
};

const respondToPost = (url: string) =>
  url.endsWith(CONTACTS_PATH) ? Promise.resolve({ data: SENDER_CONTACT }) : Promise.resolve({ data: { id: 'deal-1' } });

const renderSection = (props: React.ComponentProps<typeof CRMDealsSection>) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CRMDealsSection {...props} />
    </QueryClientProvider>
  );
};

const clickAddDeal = () => fireEvent.click(screen.getByTitle('crm.createDeal'));
const saveButton = () => screen.getByRole('button', { name: 'deals.save' });
const titleInput = () => screen.getAllByRole('textbox')[0];
const stageSelect = () => screen.getAllByRole('combobox')[1];
const contactPicker = () => screen.getByRole('button', { name: 'deals.contact' });
const requestCount = () => mockedAxios.get.mock.calls.length + mockedAxios.post.mock.calls.length;

describe('CRMDealsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockImplementation(respondToGet);
    mockedAxios.post.mockImplementation(respondToPost);
  });

  it('renders the Deals section header and the add-deal (+) button', () => {
    renderSection({ senderEmail: SENDER_EMAIL });
    expect(screen.getByText('crm.deals')).toBeInTheDocument();
    expect(screen.getByTitle('crm.createDeal')).toBeInTheDocument();
  });

  // The report: "+" took ~3s because the form waited for POST /contacts and
  // then the whole address book. It must now appear in the same render as the click.
  it('opens the deal form on click without waiting for any request', () => {
    const pending: PendingRequest[] = [];
    const neverAnswered = () =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    mockedAxios.get.mockImplementation(neverAnswered);
    mockedAxios.post.mockImplementation(neverAnswered);
    renderSection({ senderEmail: SENDER_EMAIL });

    clickAddDeal();

    expect(screen.getByText('deals.addDeal')).toBeInTheDocument();
    expect(titleInput()).toBeInTheDocument();
    // The lookups are under way, just not in front of the form.
    expect(pending.length).toBeGreaterThan(0);
  });

  it('fills in the stage and the sender contact once they arrive', async () => {
    renderSection({ senderEmail: SENDER_EMAIL });

    clickAddDeal();

    await waitFor(() => expect(contactPicker()).toHaveTextContent(SENDER_CONTACT.name));
    expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining(CONTACTS_PATH), { email: SENDER_EMAIL });
    expect(stageSelect()).toHaveValue('stage-lead');
  });

  it('keeps Save disabled until the sender contact is known, so the deal is linked to it', async () => {
    let answerContact: PendingRequest | undefined;
    mockedAxios.post.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          answerContact = { resolve, reject };
        })
    );
    renderSection({ senderEmail: SENDER_EMAIL });
    clickAddDeal();
    fireEvent.change(titleInput(), { target: { value: 'Pilot' } });
    await waitFor(() => expect(answerContact).toBeDefined());

    expect(saveButton()).toBeDisabled();

    await act(async () => answerContact?.resolve({ data: SENDER_CONTACT }));

    await waitFor(() => expect(saveButton()).toBeEnabled());
  });

  it('does not create a contact when the contact is already known (contactId provided)', async () => {
    renderSection({ senderEmail: SENDER_EMAIL, contactId: 'existing-contact' });

    clickAddDeal();

    expect(await screen.findByText('deals.addDeal')).toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('serves a second open from cache instead of refetching', async () => {
    renderSection({ senderEmail: SENDER_EMAIL });
    clickAddDeal();
    await waitFor(() => expect(contactPicker()).toHaveTextContent(SENDER_CONTACT.name));
    const requestsAfterFirstOpen = requestCount();

    fireEvent.click(screen.getByRole('button', { name: 'deals.cancel' }));
    clickAddDeal();

    expect(contactPicker()).toHaveTextContent(SENDER_CONTACT.name);
    expect(requestCount()).toBe(requestsAfterFirstOpen);
  });

  it('starts loading the stages and contacts when the pointer reaches the + button', async () => {
    renderSection({ senderEmail: SENDER_EMAIL });

    fireEvent.pointerEnter(screen.getByTitle('crm.createDeal'));

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining(STAGES_PATH)));
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining(CONTACTS_PATH));
  });

  it('shows a failed save inside the form and keeps what was typed', async () => {
    mockedAxios.post.mockImplementation((url: string) =>
      url.endsWith(DEALS_PATH) ? Promise.reject(new Error('network down')) : respondToPost(url)
    );
    renderSection({ senderEmail: SENDER_EMAIL });
    clickAddDeal();
    fireEvent.change(titleInput(), { target: { value: 'Pilot' } });
    await waitFor(() => expect(saveButton()).toBeEnabled());

    fireEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('crm.errorCreatingDeal');
    expect(titleInput()).toHaveValue('Pilot');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(DEALS_PATH),
      expect.objectContaining({ title: 'Pilot', contactId: SENDER_CONTACT.id })
    );
  });

  it('tells the user when the stages or contacts cannot be loaded, without closing the form', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network down'));
    renderSection({ senderEmail: SENDER_EMAIL });

    clickAddDeal();

    expect(await screen.findByRole('alert')).toHaveTextContent('crm.errorLoadingDealForm');
    expect(screen.getByText('deals.addDeal')).toBeInTheDocument();
  });
});
