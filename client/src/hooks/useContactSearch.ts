import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { Contact } from 'types/contact';
import { ContactGroup, RecipientSuggestion } from 'types/contactGroup';

import { API_URL } from 'config/api';
import { CONTACT_SEARCH_MIN_QUERY_LENGTH, CONTACT_SUGGESTION_LIMIT, DEBOUNCE_DELAY_200_MS } from 'constants/numbers';
import { EMAIL_FIELD_CC, EMAIL_FIELD_TO, PROMISE_STATUS_FULFILLED } from 'constants/strings';

export interface UseContactSearchResult {
  toSearch: string;
  ccSearch: string;
  bccSearch: string;
  searchResults: Contact[];
  /** Merged suggestions including contact groups — used by RecipientFields in Compose. */
  recipientSuggestions: RecipientSuggestion[];
  activeField: 'to' | 'cc' | 'bcc' | null;
  selectedSuggestionIndex: number;
  searching: boolean;
  setToSearch: (value: string) => void;
  setCcSearch: (value: string) => void;
  setBccSearch: (value: string) => void;
  setActiveField: (field: 'to' | 'cc' | 'bcc' | null) => void;
  setSelectedSuggestionIndex: (index: number) => void;
  searchContacts: (query: string) => Promise<void>;
  handleSearchInput: (value: string, field: 'to' | 'cc' | 'bcc') => void;
  getSearchValue: (field: 'to' | 'cc' | 'bcc') => string;
  clearSearch: () => void;
  // Backward-compat aliases used by Contacts.tsx
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  /** Search results while a query is active (even when empty); `baseContacts` otherwise. */
  filteredContacts: (baseContacts: Contact[]) => Contact[];
  /** True while the results on screen belong to an older query than the one typed (debounce window). */
  hasPendingSearch: boolean;
}

export interface UseContactSearchOptions {
  /** Max results requested from the server (default: recipient-autocomplete size). */
  resultLimit?: number;
}

const isSearchableQuery = (query: string): boolean => query.trim().length >= CONTACT_SEARCH_MIN_QUERY_LENGTH;

function scheduleDebouncedSearch(
  query: string,
  timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  searchFn: (q: string) => Promise<void>
): void {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
  }
  timeoutRef.current = setTimeout(() => {
    searchFn(query);
  }, DEBOUNCE_DELAY_200_MS);
}

async function fetchContactSearch(
  query: string,
  resultLimit: number
): Promise<{ contacts: Contact[]; groups: ContactGroup[] }> {
  // allSettled never rejects: a failed request just yields an empty list.
  const [contactsRes, groupsRes] = await Promise.allSettled([
    axios.get<Contact[]>(`${API_URL}/contacts/search?q=${encodeURIComponent(query)}&limit=${resultLimit}`),
    axios.get<ContactGroup[]>(`${API_URL}/contact-groups/search?q=${encodeURIComponent(query)}`),
  ]);
  return {
    contacts: contactsRes.status === PROMISE_STATUS_FULFILLED ? (contactsRes.value?.data ?? []) : [],
    groups: groupsRes.status === PROMISE_STATUS_FULFILLED ? (groupsRes.value?.data ?? []) : [],
  };
}

export const useContactSearch = ({
  resultLimit = CONTACT_SUGGESTION_LIMIT,
}: UseContactSearchOptions = {}): UseContactSearchResult => {
  const [toSearch, setToSearch] = useState('');
  const [ccSearch, setCcSearch] = useState('');
  const [bccSearch, setBccSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [groupResults, setGroupResults] = useState<ContactGroup[]>([]);
  const [activeField, setActiveField] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef('');

  const searchContacts = useCallback(
    async (query: string) => {
      latestQueryRef.current = query;
      if (!query || query.length < CONTACT_SEARCH_MIN_QUERY_LENGTH) {
        setSearchResults([]);
        setGroupResults([]);
        setSearchedQuery(query ?? '');
        return;
      }

      setSearching(true);
      const { contacts, groups } = await fetchContactSearch(query, resultLimit);
      // A slower response for an older query must not overwrite a newer one.
      if (latestQueryRef.current !== query) {
        return;
      }
      setSearchResults(contacts);
      setGroupResults(groups);
      setSelectedSuggestionIndex(-1);
      setSearchedQuery(query);
      setSearching(false);
    },
    [resultLimit]
  );

  const handleSearchInput = useCallback(
    (value: string, field: 'to' | 'cc' | 'bcc') => {
      if (field === EMAIL_FIELD_TO) {
        setToSearch(value);
      } else if (field === EMAIL_FIELD_CC) {
        setCcSearch(value);
      } else {
        setBccSearch(value);
      }
      setActiveField(field);
      scheduleDebouncedSearch(value, searchTimeoutRef, searchContacts);
    },
    [searchContacts]
  );

  const getSearchValue = useCallback(
    (field: 'to' | 'cc' | 'bcc'): string => {
      if (field === EMAIL_FIELD_TO) {
        return toSearch;
      }
      if (field === EMAIL_FIELD_CC) {
        return ccSearch;
      }
      return bccSearch;
    },
    [toSearch, ccSearch, bccSearch]
  );

  const clearSearch = useCallback(() => {
    setToSearch('');
    setCcSearch('');
    setBccSearch('');
    setSearchResults([]);
    setGroupResults([]);
    setActiveField(null);
  }, []);

  // Backward-compat helpers for Contacts.tsx (single-field search)
  const setSearchQuery = useCallback(
    (query: string) => {
      setToSearch(query);
      scheduleDebouncedSearch(query, searchTimeoutRef, searchContacts);
    },
    [searchContacts]
  );

  // An active query shows only its results — never the full list when nothing
  // matched, which looked like the search had ignored the query.
  const filteredContacts = useCallback(
    (baseContacts: Contact[]): Contact[] => (isSearchableQuery(toSearch) ? searchResults : baseContacts),
    [searchResults, toSearch]
  );
  const hasPendingSearch = isSearchableQuery(toSearch) && searchedQuery !== toSearch;

  // Merged suggestions: groups first (with distinct kind tag), then contacts
  const recipientSuggestions: RecipientSuggestion[] = [
    ...groupResults.map((grp): RecipientSuggestion => ({ kind: 'group', group: grp })),
    ...searchResults.map((contact): RecipientSuggestion => ({ kind: 'contact', contact })),
  ];

  return {
    toSearch,
    ccSearch,
    bccSearch,
    searchResults,
    recipientSuggestions,
    activeField,
    selectedSuggestionIndex,
    searching,
    setToSearch,
    setCcSearch,
    setBccSearch,
    setActiveField,
    setSelectedSuggestionIndex,
    searchContacts,
    handleSearchInput,
    getSearchValue,
    clearSearch,
    // Backward-compat aliases
    searchQuery: toSearch,
    setSearchQuery,
    filteredContacts,
    hasPendingSearch,
  };
};
