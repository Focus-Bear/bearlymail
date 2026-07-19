import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ContactGroup, CreateContactGroupPayload, UpdateContactGroupPayload } from 'types/contactGroup';

import { API_URL } from 'config/api';

const BASE = `${API_URL}/contact-groups`;

// ── API helpers ──────────────────────────────────────────────────────────────

export const fetchContactGroups = (): Promise<ContactGroup[]> => axios.get<ContactGroup[]>(BASE).then(res => res.data);

export const fetchContactGroupSearch = (query: string): Promise<ContactGroup[]> =>
  axios.get<ContactGroup[]>(`${BASE}/search`, { params: { q: query } }).then(res => res.data);

export const createContactGroup = (payload: CreateContactGroupPayload): Promise<ContactGroup> =>
  axios.post<ContactGroup>(BASE, payload).then(res => res.data);

export const updateContactGroup = (id: string, payload: UpdateContactGroupPayload): Promise<ContactGroup> =>
  axios.put<ContactGroup>(`${BASE}/${id}`, payload).then(res => res.data);

export const deleteContactGroup = (id: string): Promise<void> => axios.delete(`${BASE}/${id}`).then(() => undefined);

// ── Query keys ───────────────────────────────────────────────────────────────

export const CONTACT_GROUPS_KEY = ['contactGroups'] as const;

// ── React Query hooks ────────────────────────────────────────────────────────

export const useContactGroupsQuery = () =>
  useQuery<ContactGroup[]>({
    queryKey: CONTACT_GROUPS_KEY,
    queryFn: fetchContactGroups,
  });

export const useCreateContactGroupMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createContactGroup,
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACT_GROUPS_KEY }),
  });
};

export const useUpdateContactGroupMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateContactGroupPayload }) =>
      updateContactGroup(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACT_GROUPS_KEY }),
  });
};

export const useDeleteContactGroupMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteContactGroup,
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACT_GROUPS_KEY }),
  });
};
