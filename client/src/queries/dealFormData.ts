import { QueryClient, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Contact } from 'types/contact';
import { DealStage } from 'types/deal';

import { API_URL } from 'config/api';

import { STALE_TIME_5_MIN, STALE_TIME_NEVER } from './constants';
import { contactKeys, dealKeys } from './queryKeys';

/**
 * The lookups the "Add Deal" form needs (pipeline stages and the contact
 * picker's list). They are cached so the form can open instantly with
 * whatever is already known and fill in when the network answers — GET
 * /contacts returns the user's whole address book, decrypted row by row,
 * which is far too slow to sit in front of the form.
 */
export const fetchDealStages = (): Promise<DealStage[]> =>
  axios.get<DealStage[]>(`${API_URL}/deals/stages`).then(res => res.data ?? []);

export const fetchContactList = (): Promise<Contact[]> =>
  axios.get<Contact[]>(`${API_URL}/contacts`).then(res => res.data ?? []);

/** Find-or-create the contact for an email address (POST /contacts is idempotent on email). */
export const ensureContactForEmail = (email: string): Promise<Contact> =>
  axios.post<Contact>(`${API_URL}/contacts`, { email }).then(res => res.data);

const dealStagesQuery = { queryKey: dealKeys.stages, queryFn: fetchDealStages, staleTime: STALE_TIME_5_MIN };
const contactListQuery = { queryKey: contactKeys.list, queryFn: fetchContactList, staleTime: STALE_TIME_5_MIN };

/** Warm the caches (e.g. when the pointer reaches the "+" button) so the lists are ready by the time the form shows. */
export const prefetchDealFormData = (queryClient: QueryClient): void => {
  void queryClient.prefetchQuery(dealStagesQuery);
  void queryClient.prefetchQuery(contactListQuery);
};

export const useDealStagesQuery = (isEnabled: boolean) => useQuery({ ...dealStagesQuery, enabled: isEnabled });

export const useContactListQuery = (isEnabled: boolean) => useQuery({ ...contactListQuery, enabled: isEnabled });

/**
 * The sender's contact, found or created once per address. A POST behind a
 * query is safe here because the endpoint is idempotent on email, and caching
 * it means reopening the form for the same sender makes no request at all.
 */
export const useContactForEmailQuery = (email: string | undefined, isEnabled: boolean) =>
  useQuery({
    queryKey: contactKeys.forEmail(email ?? ''),
    queryFn: () => ensureContactForEmail(email ?? ''),
    enabled: isEnabled && Boolean(email),
    staleTime: STALE_TIME_NEVER,
  });
