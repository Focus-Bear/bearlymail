import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useDealNoteMutations, useDealNotesQuery } from 'queries/dealNotes';
import { DealNote } from 'types/deal';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { DealNotesSection } from './DealNotesSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
const showError = vi.fn();
vi.mock('contexts/NotificationContext', () => ({ useNotifications: () => ({ showError }) }));
vi.mock('queries/dealNotes', () => ({ useDealNotesQuery: vi.fn(), useDealNoteMutations: vi.fn() }));

const DEAL_ID = 'deal-1';
const NOTE: DealNote = {
  id: 'note-1',
  dealId: DEAL_ID,
  content: 'Sent the proposal',
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
};

const mutation = (mutateAsync = vi.fn().mockResolvedValue(undefined)) => ({ mutateAsync, isPending: false });

const givenNotes = (notes: DealNote[]) =>
  vi
    .mocked(useDealNotesQuery)
    .mockReturnValue({ data: notes, isLoading: false, isError: false } as unknown as ReturnType<
      typeof useDealNotesQuery
    >);

const givenMutations = (
  overrides: Partial<Record<'addNote' | 'editNote' | 'removeNote', ReturnType<typeof mutation>>> = {}
) => {
  const mutations = { addNote: mutation(), editNote: mutation(), removeNote: mutation(), ...overrides };
  vi.mocked(useDealNoteMutations).mockReturnValue(mutations as unknown as ReturnType<typeof useDealNoteMutations>);
  return mutations;
};

describe('DealNotesSection', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows an empty state when the deal has no notes', () => {
    givenNotes([]);
    givenMutations();
    render(<DealNotesSection dealId={DEAL_ID} />);
    expect(screen.getByText('deals.notes.empty')).toBeInTheDocument();
  });

  it('adds a trimmed note and clears the box', async () => {
    givenNotes([]);
    const { addNote } = givenMutations();
    render(<DealNotesSection dealId={DEAL_ID} />);
    const box = screen.getByLabelText('deals.notes.placeholder');
    fireEvent.change(box, { target: { value: '  Called Dana  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'deals.notes.add' }));
    await waitFor(() => expect(addNote.mutateAsync).toHaveBeenCalledWith('Called Dana'));
    await waitFor(() => expect(box).toHaveValue(''));
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.DEAL_NOTE_ADDED);
  });

  it('does not allow adding a blank note', () => {
    givenNotes([]);
    givenMutations();
    render(<DealNotesSection dealId={DEAL_ID} />);
    fireEvent.change(screen.getByLabelText('deals.notes.placeholder'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'deals.notes.add' })).toBeDisabled();
  });

  it('lists notes with their text and an edited marker only when changed', () => {
    givenNotes([NOTE, { ...NOTE, id: 'note-2', content: 'Revised price', updatedAt: '2026-11-02T10:00:00.000Z' }]);
    givenMutations();
    render(<DealNotesSection dealId={DEAL_ID} />);
    expect(screen.getAllByTestId('deal-note-item')).toHaveLength(2);
    expect(screen.getByText('Sent the proposal')).toBeInTheDocument();
    expect(screen.getAllByText(/deals\.notes\.edited/)).toHaveLength(1);
  });

  it('edits a note in place', async () => {
    givenNotes([NOTE]);
    const { editNote } = givenMutations();
    render(<DealNotesSection dealId={DEAL_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'deals.notes.edit' }));
    fireEvent.change(screen.getByLabelText('deals.notes.editLabel'), { target: { value: 'Proposal accepted' } });
    fireEvent.click(screen.getByRole('button', { name: 'deals.save' }));
    await waitFor(() =>
      expect(editNote.mutateAsync).toHaveBeenCalledWith({ noteId: NOTE.id, content: 'Proposal accepted' })
    );
    await waitFor(() => expect(screen.queryByLabelText('deals.notes.editLabel')).not.toBeInTheDocument());
  });

  it('keeps the editor open and reports the error when saving fails', async () => {
    givenNotes([NOTE]);
    givenMutations({ editNote: mutation(vi.fn().mockRejectedValue(new Error('500'))) });
    render(<DealNotesSection dealId={DEAL_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'deals.notes.edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'deals.save' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('deals.notes.saveError'));
    expect(screen.getByLabelText('deals.notes.editLabel')).toBeInTheDocument();
  });

  it('deletes a note after confirmation', async () => {
    givenNotes([NOTE]);
    const { removeNote } = givenMutations();
    render(<DealNotesSection dealId={DEAL_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'deals.delete' }));
    await waitFor(() => expect(removeNote.mutateAsync).toHaveBeenCalledWith(NOTE.id));
  });

  it('keeps the note when deletion is not confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    givenNotes([NOTE]);
    const { removeNote } = givenMutations();
    render(<DealNotesSection dealId={DEAL_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'deals.delete' }));
    expect(removeNote.mutateAsync).not.toHaveBeenCalled();
  });
});
