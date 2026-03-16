import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { Contact } from 'types/contact';

import { API_URL } from 'config/api';
import { DEBOUNCE_DELAY_200_MS } from 'constants/numbers';
import { EMAIL_FIELD_CC, EMAIL_FIELD_TO } from 'constants/strings';

export interface UseContactSearchResult {
  toSearch: string;
  ccSearch: string;
  bccSearch: string;
  searchResults: Contact[];
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
  filteredContacts: (baseContacts: Contact[]) => Contact[];
}

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

export const useContactSearch = (): UseContactSearchResult => {
  const [toSearch, setToSearch] = useState('');
  const [ccSearch, setCcSearch] = useState('');
  const [bccSearch, setBccSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [activeField, setActiveField] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await axios.get(`${API_URL}/contacts/search?q=${encodeURIComponent(query)}&limit=8`);
      setSearchResults(response.data);
      setSelectedSuggestionIndex(-1);
    } catch (err) {
      console.error('Contact search failed:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

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

  const filteredContacts = useCallback(
    (baseContacts: Contact[]): Contact[] => (searchResults.length > 0 ? searchResults : baseContacts),
    [searchResults]
  );

  return {
    toSearch,
    ccSearch,
    bccSearch,
    searchResults,
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
  };
};
