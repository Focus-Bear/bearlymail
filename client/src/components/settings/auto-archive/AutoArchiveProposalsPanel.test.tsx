import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

import { AutoArchiveProposal } from './autoArchiveProposals.api';
import { AutoArchiveProposalsPanel } from './AutoArchiveProposalsPanel';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showSuccess, showError }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

const stats = (overrides = {}) => ({
  matched: 48,
  engaged: 0,
  strongEngaged: 0,
  glanced: 0,
  opened: 0,
  replied: 0,
  starred: 0,
  ...overrides,
});

const proposal: AutoArchiveProposal = {
  id: 'p1',
  status: 'pending',
  scope: 'address',
  senderDisplay: 'GitHub <notifications@github.com>',
  condition: {
    senderPattern: 'notifications@github.com',
    subjectPatterns: ['check translations'],
    bodyPatterns: [],
  },
  evidence: {
    windowDays: 60,
    senderTotal: 132,
    window: stats(),
    holdout: stats({ matched: 17 }),
    openRate: 0,
    engagementUpperBound: 0.07,
    clusterSize: 31,
    sampleSubjects: ['[Focus-Bear/Mac-App] Run failed: Check Translations - main (cc20259)'],
    firstMatchedAt: '2026-08-21T07:52:09.444Z',
    lastMatchedAt: '2026-10-19T13:19:54.484Z',
  },
  workflowRuleId: null,
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
};

describe('AutoArchiveProposalsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: [proposal] });
    mockedAxios.post.mockResolvedValue({ data: { ...proposal, status: 'approved' } });
  });

  it('shows the proposed rule, its evidence and the precision safeguard', async () => {
    render(<AutoArchiveProposalsPanel />);

    expect(await screen.findByText('GitHub <notifications@github.com>')).toBeInTheDocument();
    expect(screen.getByText('check translations')).toBeInTheDocument();
    expect(screen.getByText('settings.autoArchive.impact.engagedNone')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('approving creates the rule, removes the card and refreshes workflows', async () => {
    const onRuleCreated = vi.fn();
    render(<AutoArchiveProposalsPanel onRuleCreated={onRuleCreated} />);

    await userEvent.click(await screen.findByText('settings.autoArchive.card.approve'));

    await waitFor(() => expect(onRuleCreated).toHaveBeenCalled());
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toMatch(/\/auto-archive-proposals\/p1\/approve$/);
    expect(body).toEqual({
      name: expect.stringContaining('settings.autoArchive.ruleName'),
      keywords: undefined,
    });
    expect(showSuccess).toHaveBeenCalledWith('settings.autoArchive.approved');
    expect(screen.queryByText('GitHub <notifications@github.com>')).not.toBeInTheDocument();
  });

  it('dismissing is remembered server-side and creates nothing', async () => {
    const onRuleCreated = vi.fn();
    render(<AutoArchiveProposalsPanel onRuleCreated={onRuleCreated} />);

    await userEvent.click(await screen.findByText('settings.autoArchive.card.dismiss'));

    await waitFor(() =>
      expect(screen.queryByText('GitHub <notifications@github.com>')).not.toBeInTheDocument()
    );
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][0]).toMatch(/\/auto-archive-proposals\/p1\/dismiss$/);
    expect(onRuleCreated).not.toHaveBeenCalled();
  });

  it('editing keywords re-checks the rule and approves the edited version', async () => {
    mockedAxios.post.mockImplementation(async (url: string) =>
      url.endsWith('/preview')
        ? { data: { condition: proposal.condition, senderTotal: 132, window: stats({ matched: 75, engaged: 33, replied: 9 }), sampleSubjects: [] } }
        : { data: { ...proposal, status: 'approved' } }
    );
    render(<AutoArchiveProposalsPanel />);

    await userEvent.click(await screen.findByText('settings.autoArchive.card.edit'));
    await userEvent.click(screen.getByLabelText('common.remove'));
    await userEvent.type(
      screen.getByPlaceholderText('settings.autoArchive.editor.subjectPlaceholder'),
      '[[Focus-Bear/Mac-App]{enter}'
    );

    await waitFor(() =>
      expect(
        screen.getByText('settings.autoArchive.impact.engagedSome:{"count":33,"replied":9}')
      ).toBeInTheDocument()
    );
    const previewCalls = mockedAxios.post.mock.calls.filter(([url]) => String(url).endsWith('/preview'));
    expect(previewCalls[previewCalls.length - 1][1]).toEqual({
      subjectPatterns: ['[Focus-Bear/Mac-App]'],
      bodyPatterns: [],
    });

    await userEvent.click(screen.getByText('settings.autoArchive.card.approveEdited'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    const approveCall = mockedAxios.post.mock.calls.find(([url]) => String(url).endsWith('/approve'));
    expect(approveCall?.[1]).toMatchObject({
      keywords: { subjectPatterns: ['[Focus-Bear/Mac-App]'], bodyPatterns: [] },
    });
  });

  it('shows an empty state when there is nothing to suggest', async () => {
    mockedAxios.get.mockResolvedValue({ data: [] });
    render(<AutoArchiveProposalsPanel />);

    expect(await screen.findByText('settings.autoArchive.empty')).toBeInTheDocument();
  });

  it('queues a fresh check on request', async () => {
    mockedAxios.post.mockResolvedValue({ data: { queued: true } });
    render(<AutoArchiveProposalsPanel />);

    await userEvent.click(await screen.findByText('settings.autoArchive.scanNow'));

    expect(mockedAxios.post.mock.calls[0][0]).toMatch(/\/auto-archive-proposals\/scan$/);
    expect(await screen.findByText('settings.autoArchive.scanQueued')).toBeInTheDocument();
  });
});
