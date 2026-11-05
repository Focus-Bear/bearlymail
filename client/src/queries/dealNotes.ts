import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { DealNote } from 'types/deal';

import { API_URL } from 'config/api';

const dealNotesUrl = (dealId: string) => `${API_URL}/deals/${dealId}/notes`;

export const fetchDealNotes = (dealId: string): Promise<DealNote[]> =>
  axios.get<DealNote[]>(dealNotesUrl(dealId)).then(res => res.data);

export const createDealNote = (dealId: string, content: string): Promise<DealNote> =>
  axios.post<DealNote>(dealNotesUrl(dealId), { content }).then(res => res.data);

export const updateDealNote = (dealId: string, noteId: string, content: string): Promise<DealNote> =>
  axios.put<DealNote>(`${dealNotesUrl(dealId)}/${noteId}`, { content }).then(res => res.data);

export const deleteDealNote = (dealId: string, noteId: string): Promise<void> =>
  axios.delete(`${dealNotesUrl(dealId)}/${noteId}`).then(() => undefined);

export const dealNotesKey = (dealId: string) => ['deals', dealId, 'notes'] as const;

export const useDealNotesQuery = (dealId: string) =>
  useQuery<DealNote[]>({
    queryKey: dealNotesKey(dealId),
    queryFn: () => fetchDealNotes(dealId),
  });

/** Add, edit and delete for one deal's notes; each refreshes the list on success. */
export const useDealNoteMutations = (dealId: string) => {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: dealNotesKey(dealId) });
  return {
    addNote: useMutation({
      mutationFn: (content: string) => createDealNote(dealId, content),
      onSuccess: refresh,
    }),
    editNote: useMutation({
      mutationFn: ({ noteId, content }: { noteId: string; content: string }) => updateDealNote(dealId, noteId, content),
      onSuccess: refresh,
    }),
    removeNote: useMutation({
      mutationFn: (noteId: string) => deleteDealNote(dealId, noteId),
      onSuccess: refresh,
    }),
  };
};
