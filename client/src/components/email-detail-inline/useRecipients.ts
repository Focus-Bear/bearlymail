import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Contact } from 'types/contact';

import { API_URL } from 'config/api';
import { DEBOUNCE_DELAY_200_MS } from 'constants/numbers';
import { EMAIL_FIELD_BCC, EMAIL_FIELD_CC, EMAIL_FIELD_TO, KEY_ARROW_DOWN, KEY_ARROW_UP, KEY_BACKSPACE, KEY_ENTER, KEY_ESCAPE } from 'constants/strings';

type FieldType = typeof EMAIL_FIELD_TO | typeof EMAIL_FIELD_CC | typeof EMAIL_FIELD_BCC;
type DispatchFns = { onRecipientsChange: (v: string) => void; onCcChange: (v: string) => void; onBccChange: (v: string) => void };

const parseEmailsToTags = (value: string): string[] =>
  value.split(',').map(event => event.trim()).filter(event => event.length > 0);

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const extracted = email.match(/<([^>]+)>/)?.[1] || email;
  return emailRegex.test(extracted.trim());
};

const getTagsForField = (field: FieldType, toTags: string[], ccTags: string[], bccTags: string[]): string[] => {
  if (field === EMAIL_FIELD_TO) return toTags;
  if (field === EMAIL_FIELD_CC) return ccTags;
  return bccTags;
};

const dispatchToField = (field: FieldType, newValue: string, { onRecipientsChange, onCcChange, onBccChange }: DispatchFns) => {
  if (field === EMAIL_FIELD_TO) onRecipientsChange(newValue);
  else if (field === EMAIL_FIELD_CC) onCcChange(newValue);
  else onBccChange(newValue);
};

const applyRemoveTag = (index: number, field: FieldType, toTags: string[], ccTags: string[], bccTags: string[], dispatch: DispatchFns) => {
  const tags = getTagsForField(field, toTags, ccTags, bccTags);
  dispatchToField(field, tags.filter((_, i) => i !== index).join(', '), dispatch);
};

const applySelectContact = (contact: Contact, field: FieldType, toTags: string[], ccTags: string[], bccTags: string[], dispatch: DispatchFns) => {
  const current = getTagsForField(field, toTags, ccTags, bccTags);
  const display = contact.name ? `${contact.name} <${contact.email}>` : contact.email;
  dispatchToField(field, [...current, display].join(', '), dispatch);
};

interface CommaEntryContext {
  tags: { toTags: string[]; ccTags: string[]; bccTags: string[] };
  dispatch: DispatchFns;
  setInputValues: React.Dispatch<React.SetStateAction<Record<FieldType, string>>>;
}

const processInputCommaEntry = (value: string, field: FieldType, ctx: CommaEntryContext): string => {
  const { tags: { toTags, ccTags, bccTags }, dispatch, setInputValues } = ctx;
  const parts = value.split(',');
  const newEmails = parts.slice(0, -1).map(event => event.trim()).filter(event => event.length > 0 && !/[\r\n]/.test(event) && isValidEmail(event));
  const remaining = parts[parts.length - 1];
  if (newEmails.length > 0) {
    const allTags = [...getTagsForField(field, toTags, ccTags, bccTags), ...newEmails];
    dispatchToField(field, allTags.join(', '), dispatch);
    setInputValues(prev => ({ ...prev, [field]: remaining.trim() }));
  }
  return remaining.trim();
};

export const useRecipients = ({
  replyRecipients, replyCc, replyBcc, onRecipientsChange, onCcChange, onBccChange,
}: {
  replyRecipients: string; replyCc: string; replyBcc: string;
  onRecipientsChange: (recipients: string) => void; onCcChange: (cc: string) => void; onBccChange: (bcc: string) => void;
}) => {
  const [activeField, setActiveField] = useState<FieldType | null>(null);
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [inputValues, setInputValues] = useState<Record<FieldType, string>>({ [EMAIL_FIELD_TO]: '', [EMAIL_FIELD_CC]: '', [EMAIL_FIELD_BCC]: '' });
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dispatch: DispatchFns = { onRecipientsChange, onCcChange, onBccChange };

  const toTags = useMemo(() => parseEmailsToTags(replyRecipients), [replyRecipients]);
  const ccTags = useMemo(() => parseEmailsToTags(replyCc), [replyCc]);
  const bccTags = useMemo(() => parseEmailsToTags(replyBcc), [replyBcc]);

  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 2) { setSearchResults([]); return; }
    try {
      const response = await axios.get(`${API_URL}/contacts/search?q=${encodeURIComponent(query)}&limit=8`);
      setSearchResults(response.data);
      setSelectedSuggestionIndex(-1);
    } catch { setSearchResults([]); }
  }, []);

  const handleRemoveTag = useCallback((index: number, field: FieldType) => {
    applyRemoveTag(index, field, toTags, ccTags, bccTags, dispatch);
  }, [toTags, ccTags, bccTags, onRecipientsChange, onCcChange, onBccChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = useCallback((value: string, field: FieldType) => {
    setInputValues(prev => ({ ...prev, [field]: value }));
    setActiveField(field);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (value.includes(',')) {
      processInputCommaEntry(value, field, { tags: { toTags, ccTags, bccTags }, dispatch, setInputValues });
    }
    const searchQuery = value.split(',').pop()?.trim() || value.trim();
    searchTimeoutRef.current = setTimeout(() => searchContacts(searchQuery), DEBOUNCE_DELAY_200_MS);
  }, [toTags, ccTags, bccTags, onRecipientsChange, onCcChange, onBccChange, searchContacts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectContact = useCallback((contact: Contact, field: FieldType) => {
    applySelectContact(contact, field, toTags, ccTags, bccTags, dispatch);
    setInputValues(prev => ({ ...prev, [field]: '' }));
    setSearchResults([]);
    setActiveField(null);
  }, [toTags, ccTags, bccTags, onRecipientsChange, onCcChange, onBccChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = useCallback((event: React.KeyboardEvent, field: FieldType, searchResultsLocal: Contact[], selectedIdx: number, handleRemoveTagLocal: (i: number, f: FieldType) => void) => {
    const inputValue = inputValues[field];
    if (event.key === KEY_BACKSPACE && inputValue === '') {
      const tags = getTagsForField(field, toTags, ccTags, bccTags);
      if (tags.length > 0) handleRemoveTagLocal(tags.length - 1, field);
      return;
    }
    if (event.key === KEY_ENTER && inputValue.trim() && !/[\r\n]/.test(inputValue.trim()) && isValidEmail(inputValue.trim())) {
      event.preventDefault();
      if (selectedIdx >= 0 && searchResultsLocal.length > 0) {
        handleSelectContact(searchResultsLocal[selectedIdx], field);
      } else {
        const newTags = [...getTagsForField(field, toTags, ccTags, bccTags), inputValue.trim()];
        dispatchToField(field, newTags.join(', '), dispatch);
        setInputValues(prev => ({ ...prev, [field]: '' }));
        setSearchResults([]);
      }
      return;
    }
    if (searchResultsLocal.length === 0) return;
    if (event.key === KEY_ARROW_DOWN) { event.preventDefault(); setSelectedSuggestionIndex(prev => (prev < searchResultsLocal.length - 1 ? prev + 1 : prev)); }
    else if (event.key === KEY_ARROW_UP) { event.preventDefault(); setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : -1)); }
    else if (event.key === KEY_ENTER && selectedIdx >= 0) { event.preventDefault(); handleSelectContact(searchResultsLocal[selectedIdx], field); }
    else if (event.key === KEY_ESCAPE) { setSearchResults([]); setActiveField(null); }
  }, [inputValues, toTags, ccTags, bccTags, handleSelectContact, onRecipientsChange, onCcChange, onBccChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlur = useCallback((field: FieldType) => {
    const inputValue = inputValues[field]?.trim();
    if (inputValue && !/[\r\n]/.test(inputValue) && isValidEmail(inputValue)) {
      const newTags = [...getTagsForField(field, toTags, ccTags, bccTags), inputValue];
      dispatchToField(field, newTags.join(', '), dispatch);
      setInputValues(prev => ({ ...prev, [field]: '' }));
    }
    setTimeout(() => { setSearchResults([]); setActiveField(null); }, DEBOUNCE_DELAY_200_MS);
  }, [inputValues, toTags, ccTags, bccTags, onRecipientsChange, onCcChange, onBccChange]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSearchResults([]); setActiveField(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return { toTags, ccTags, bccTags, activeField, setActiveField, searchResults, setSearchResults, selectedSuggestionIndex, setSelectedSuggestionIndex, inputValues, setInputValues, dropdownRef, handleInputChange, handleKeyDown, handleSelectContact, handleRemoveTag, handleBlur } as const;
};
