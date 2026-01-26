import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Contact } from 'types/contact';
import { DEBOUNCE_DELAY_200_MS } from 'constants/numbers';
import { EMAIL_FIELD_TO, EMAIL_FIELD_CC } from 'constants/strings';
import { API_URL } from 'config/api';

export const useContactSearch = () => {
  const [toSearch, setToSearch] = useState('');
  const [ccSearch, setCcSearch] = useState('');
  const [bccSearch, setBccSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [activeField, setActiveField] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/contacts/search?q=${encodeURIComponent(query)}&limit=8`);
      setSearchResults(response.data);
      setSelectedSuggestionIndex(-1);
    } catch (err) {
      console.error('Contact search failed:', err);
      setSearchResults([]);
    }
  }, []);

  const handleSearchInput = useCallback((value: string, field: 'to' | 'cc' | 'bcc') => {
    if (field === EMAIL_FIELD_TO) setToSearch(value);
    else if (field === EMAIL_FIELD_CC) setCcSearch(value);
    else setBccSearch(value);
    
    setActiveField(field);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchContacts(value);
    }, DEBOUNCE_DELAY_200_MS);
  }, [searchContacts]);

  const getSearchValue = useCallback((field: 'to' | 'cc' | 'bcc') => {
    if (field === EMAIL_FIELD_TO) return toSearch;
    if (field === EMAIL_FIELD_CC) return ccSearch;
    return bccSearch;
  }, [toSearch, ccSearch, bccSearch]);

  const clearSearch = useCallback(() => {
    setToSearch('');
    setCcSearch('');
    setBccSearch('');
    setSearchResults([]);
    setActiveField(null);
  }, []);

  return {
    toSearch,
    ccSearch,
    bccSearch,
    searchResults,
    activeField,
    selectedSuggestionIndex,
    setToSearch,
    setCcSearch,
    setBccSearch,
    setActiveField,
    setSelectedSuggestionIndex,
    searchContacts,
    handleSearchInput,
    getSearchValue,
    clearSearch,
  };
};
