import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { CategoryDebugDraftRulePanel } from './CategoryDebugDraftRulePanel';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('config/api', () => ({ API_URL: 'http://localhost:3001' }));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px' },
    colors: {
      background: { subtle: '#f5f5f5', paper: '#fff', default: '#fafafa' },
      text: { primary: '#111', secondary: '#666', tertiary: '#999' },
      border: { default: '#e0e0e0' },
      feedback: { error: '#d32f2f', success: '#388e3c' },
      primary: { main: '#1976d2' },
      warning: { main: '#f57c00', light: '#fff8e1' },
    },
    borderRadius: { sm: '4px', md: '8px', lg: '12px' },
    typography: {
      fontSize: { xs: '11px', sm: '12px', base: '14px', xl: '18px' },
      fontWeight: { normal: 400, medium: 500, semibold: 600 },
    },
  },
}));

const categories = [{ id: 'c1', name: 'GitHub' }];

const draft = {
  categoryName: 'GitHub',
  senderMatchesAny: ['*@github.com'],
  subjectContainsAny: ['pull request'],
  bodyContainsAny: ['left a comment'],
  subjectNotContainsAny: ['password reset'],
  bodyNotContainsAny: [],
  exclusionsDerived: true,
};

function renderPanel() {
  return render(
    <CategoryDebugDraftRulePanel emailId="e1" categories={categories} onClose={() => {}} />
  );
}

function pickCategoryAndDraft() {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'GitHub' } });
  fireEvent.click(screen.getByText('priority.categoryDebug.draftRule.generate'));
}

afterEach(() => vi.clearAllMocks());

describe('CategoryDebugDraftRulePanel', () => {
  it('drafts a rule for the chosen category and renders the editable fields', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: draft });
    renderPanel();

    pickCategoryAndDraft();

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3001/category-rules/draft-from-email',
        { emailId: 'e1', categoryName: 'GitHub' }
      )
    );
    const textareas = await screen.findAllByRole('textbox');
    const values = textareas.map(field => (field as HTMLTextAreaElement).value);
    expect(values).toContain('*@github.com');
    expect(values).toContain('pull request');
    expect(values).toContain('password reset');
  });

  it('saves the reviewed rule via the create endpoint', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: draft }).mockResolvedValueOnce({ data: {} });
    renderPanel();
    pickCategoryAndDraft();
    await screen.findByText('priority.categoryDebug.draftRule.save');

    fireEvent.click(screen.getByText('priority.categoryDebug.draftRule.save'));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenLastCalledWith(
        'http://localhost:3001/category-rules',
        expect.objectContaining({
          categoryName: 'GitHub',
          senderMatchesAny: ['*@github.com'],
          subjectContainsAny: ['pull request'],
          bodyContainsAny: ['left a comment'],
          subjectNotContainsAny: ['password reset'],
          bodyNotContainsAny: [],
        })
      )
    );
    expect(await screen.findByText('priority.categoryDebug.draftRule.saved')).toBeInTheDocument();
  });

  it('blocks saving when no exclusion phrase is present', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { ...draft, subjectNotContainsAny: [], bodyNotContainsAny: [], exclusionsDerived: false },
    });
    renderPanel();
    pickCategoryAndDraft();
    await screen.findByText('priority.categoryDebug.draftRule.save');

    fireEvent.click(screen.getByText('priority.categoryDebug.draftRule.save'));

    expect(
      await screen.findByText('priority.categoryDebug.draftRule.errorNeedsExclusion')
    ).toBeInTheDocument();
    // Only the draft call fired — no create call.
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });
});
