import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Contact } from 'types/contact';
import { ContactGroup, RecipientSuggestion } from 'types/contactGroup';
import { formatRecipientToken, splitRecipientList } from 'utils/recipientParser';

import { API_URL } from 'config/api';
import { DEBOUNCE_DELAY_200_MS } from 'constants/numbers';
import {
  EMAIL_FIELD_BCC,
  EMAIL_FIELD_CC,
  EMAIL_FIELD_TO,
  KEY_ARROW_DOWN,
  KEY_ARROW_UP,
  KEY_BACKSPACE,
  KEY_ENTER,
  KEY_ESCAPE,
  PROMISE_STATUS_FULFILLED,
  SUGGESTION_KIND_GROUP,
} from 'constants/strings';

type FieldType = typeof EMAIL_FIELD_TO | typeof EMAIL_FIELD_CC | typeof EMAIL_FIELD_BCC;
type DispatchFns = {
  onRecipientsChange: (v: string) => void;
  onCcChange: (v: string) => void;
  onBccChange: (v: string) => void;
};

const parseEmailsToTags = (value: string): string[] =>
  splitRecipientList(value)
    .map(event => event.trim())
    .filter(event => event.length > 0);

const formatRecipientDisplay = (name: string | undefined, email: string): string =>
  formatRecipientToken(name, email);

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const extracted = email.match(/<([^>]+)>/)?.[1] || email;
  return emailRegex.test(extracted.trim());
};

const getTagsForField = (field: FieldType, toTags: string[], ccTags: string[], bccTags: string[]): string[] => {
  if (field === EMAIL_FIELD_TO) {
    return toTags;
  }
  if (field === EMAIL_FIELD_CC) {
    return ccTags;
  }
  return bccTags;
};

const dispatchToField = (
  field: FieldType,
  newValue: string,
  { onRecipientsChange, onCcChange, onBccChange }: DispatchFns
) => {
  if (field === EMAIL_FIELD_TO) {
    onRecipientsChange(newValue);
  } else if (field === EMAIL_FIELD_CC) {
    onCcChange(newValue);
  } else {
    onBccChange(newValue);
  }
};

const applyRemoveTag = (
  index: number,
  field: FieldType,
  tags: { toTags: string[]; ccTags: string[]; bccTags: string[] },
  dispatch: DispatchFns
) => {
  const { toTags, ccTags, bccTags } = tags;
  const fieldTags = getTagsForField(field, toTags, ccTags, bccTags);
  dispatchToField(field, fieldTags.filter((_, i) => i !== index).join(', '), dispatch);
};

const applySelectContact = (
  contact: Contact,
  field: FieldType,
  tags: { toTags: string[]; ccTags: string[]; bccTags: string[] },
  dispatch: DispatchFns
) => {
  const { toTags, ccTags, bccTags } = tags;
  const current = getTagsForField(field, toTags, ccTags, bccTags);
  const display = formatRecipientDisplay(contact.name, contact.email);
  dispatchToField(field, [...current, display].join(', '), dispatch);
};

interface CommaEntryContext {
  tags: { toTags: string[]; ccTags: string[]; bccTags: string[] };
  dispatch: DispatchFns;
  setInputValues: React.Dispatch<React.SetStateAction<Record<FieldType, string>>>;
}

const processInputCommaEntry = (value: string, field: FieldType, ctx: CommaEntryContext): string => {
  const {
    tags: { toTags, ccTags, bccTags },
    dispatch,
    setInputValues,
  } = ctx;
  const parts = splitRecipientList(value);
  const newEmails = parts
    .slice(0, -1)
    .map(event => event.trim())
    .filter(event => event.length > 0 && !/[\r\n]/.test(event) && isValidEmail(event));
  const remaining = parts[parts.length - 1];
  if (newEmails.length > 0) {
    const allTags = [...getTagsForField(field, toTags, ccTags, bccTags), ...newEmails];
    dispatchToField(field, allTags.join(', '), dispatch);
    setInputValues(prev => ({ ...prev, [field]: remaining.trim() }));
  }
  return remaining.trim();
};

// Pure helper: processes a keydown event on a recipient input field.
function processRecipientKeyDown(params: {
  event: React.KeyboardEvent;
  field: FieldType;
  inputValue: string;
  suggestions: RecipientSuggestion[];
  selectedIdx: number;
  toTags: string[];
  ccTags: string[];
  bccTags: string[];
  dispatch: DispatchFns;
  handleRemoveTagFn: (i: number, f: FieldType) => void;
  handleSelectContactFn: (contact: Contact, f: FieldType) => void;
  handleSelectGroupFn: (group: ContactGroup, f: FieldType) => void;
  setInputValues: React.Dispatch<React.SetStateAction<Record<FieldType, string>>>;
  setSearchResults: (r: Contact[]) => void;
  setGroupResults: (r: ContactGroup[]) => void;
  setSelectedSuggestionIndex: React.Dispatch<React.SetStateAction<number>>;
  setActiveField: (f: FieldType | null) => void;
}): void {
  const {
    event,
    field,
    inputValue,
    suggestions,
    selectedIdx,
    toTags,
    ccTags,
    bccTags,
    dispatch,
    handleRemoveTagFn,
    handleSelectContactFn,
    handleSelectGroupFn,
    setInputValues,
    setSearchResults,
    setGroupResults,
    setSelectedSuggestionIndex,
    setActiveField,
  } = params;

  if (event.key === KEY_BACKSPACE && inputValue === '') {
    const tags = getTagsForField(field, toTags, ccTags, bccTags);
    if (tags.length > 0) {
      handleRemoveTagFn(tags.length - 1, field);
    }
    return;
  }

  if (
    event.key === KEY_ENTER &&
    inputValue.trim() &&
    !/[\r\n]/.test(inputValue.trim()) &&
    isValidEmail(inputValue.trim())
  ) {
    event.preventDefault();
    if (selectedIdx >= 0 && suggestions.length > 0) {
      const selected = suggestions[selectedIdx];
      if (selected.kind === SUGGESTION_KIND_GROUP) {
        handleSelectGroupFn(selected.group, field);
      } else {
        handleSelectContactFn(selected.contact, field);
      }
    } else {
      const newTags = [...getTagsForField(field, toTags, ccTags, bccTags), inputValue.trim()];
      dispatchToField(field, newTags.join(', '), dispatch);
      setInputValues(prev => ({ ...prev, [field]: '' }));
      setSearchResults([]);
      setGroupResults([]);
    }
    return;
  }

  if (suggestions.length === 0) {
    return;
  }
  if (event.key === KEY_ARROW_DOWN) {
    event.preventDefault();
    setSelectedSuggestionIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
  } else if (event.key === KEY_ARROW_UP) {
    event.preventDefault();
    setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : -1));
  } else if (event.key === KEY_ENTER && selectedIdx >= 0) {
    event.preventDefault();
    const selected = suggestions[selectedIdx];
    if (selected.kind === SUGGESTION_KIND_GROUP) {
      handleSelectGroupFn(selected.group, field);
    } else {
      handleSelectContactFn(selected.contact, field);
    }
  } else if (event.key === KEY_ESCAPE) {
    setSearchResults([]);
    setGroupResults([]);
    setActiveField(null);
  }
}

// Pure helper: handles input field change, comma-splitting, and debounced contact search.
function processFieldInputChange(params: {
  value: string;
  field: FieldType;
  toTags: string[];
  ccTags: string[];
  bccTags: string[];
  dispatch: DispatchFns;
  searchTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  searchContacts: (q: string) => Promise<void>;
  setInputValues: React.Dispatch<React.SetStateAction<Record<FieldType, string>>>;
  setActiveField: (f: FieldType | null) => void;
}): void {
  const {
    value,
    field,
    toTags,
    ccTags,
    bccTags,
    dispatch,
    searchTimeoutRef,
    searchContacts,
    setInputValues,
    setActiveField,
  } = params;
  setInputValues(prev => ({ ...prev, [field]: value }));
  setActiveField(field);
  if (searchTimeoutRef.current) {
    clearTimeout(searchTimeoutRef.current);
  }
  if (value.includes(',')) {
    processInputCommaEntry(value, field, { tags: { toTags, ccTags, bccTags }, dispatch, setInputValues });
  }
  const searchQuery = value.split(',').pop()?.trim() || value.trim();
  searchTimeoutRef.current = setTimeout(() => searchContacts(searchQuery), DEBOUNCE_DELAY_200_MS);
}

// Pure helper: handles input field blur — commits typed email as a tag, then clears search UI.
function processFieldBlur(params: {
  field: FieldType;
  inputValues: Record<FieldType, string>;
  toTags: string[];
  ccTags: string[];
  bccTags: string[];
  dispatch: DispatchFns;
  setInputValues: React.Dispatch<React.SetStateAction<Record<FieldType, string>>>;
  setSearchResults: (r: Contact[]) => void;
  setGroupResults: (r: ContactGroup[]) => void;
  setActiveField: (f: FieldType | null) => void;
}): void {
  const {
    field,
    inputValues,
    toTags,
    ccTags,
    bccTags,
    dispatch,
    setInputValues,
    setSearchResults,
    setGroupResults,
    setActiveField,
  } = params;
  const inputValue = inputValues[field]?.trim();
  if (inputValue && !/[\r\n]/.test(inputValue) && isValidEmail(inputValue)) {
    dispatchToField(field, [...getTagsForField(field, toTags, ccTags, bccTags), inputValue].join(', '), dispatch);
    setInputValues(prev => ({ ...prev, [field]: '' }));
  }
  setTimeout(() => {
    setSearchResults([]);
    setGroupResults([]);
    setActiveField(null);
  }, DEBOUNCE_DELAY_200_MS);
}

// Sub-hook: manages contact/group search state, the search API calls, and click-outside dismissal.
function useRecipientSearch() {
  const [activeField, setActiveField] = useState<FieldType | null>(null);
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [groupResults, setGroupResults] = useState<ContactGroup[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      setGroupResults([]);
      return;
    }
    try {
      const [contactsRes, groupsRes] = await Promise.allSettled([
        axios.get<Contact[]>(`${API_URL}/contacts/search?q=${encodeURIComponent(query)}&limit=8`),
        axios.get<ContactGroup[]>(`${API_URL}/contact-groups/search?q=${encodeURIComponent(query)}`),
      ]);
      setSearchResults(contactsRes.status === PROMISE_STATUS_FULFILLED ? contactsRes.value.data : []);
      setGroupResults(groupsRes.status === PROMISE_STATUS_FULFILLED ? groupsRes.value.data : []);
      setSelectedSuggestionIndex(-1);
    } catch {
      setSearchResults([]);
      setGroupResults([]);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSearchResults([]);
        setGroupResults([]);
        setActiveField(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return {
    activeField,
    setActiveField,
    searchResults,
    setSearchResults,
    groupResults,
    setGroupResults,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    searchTimeoutRef,
    dropdownRef,
    searchContacts,
  };
}

interface UseRecipientsProps {
  replyRecipients: string;
  replyCc: string;
  replyBcc: string;
  onRecipientsChange: (recipients: string) => void;
  onCcChange: (cc: string) => void;
  onBccChange: (bcc: string) => void;
}

export const useRecipients = ({
  replyRecipients,
  replyCc,
  replyBcc,
  onRecipientsChange,
  onCcChange,
  onBccChange,
}: UseRecipientsProps) => {
  const [inputValues, setInputValues] = useState<Record<FieldType, string>>({
    [EMAIL_FIELD_TO]: '',
    [EMAIL_FIELD_CC]: '',
    [EMAIL_FIELD_BCC]: '',
  });

  const {
    activeField,
    setActiveField,
    searchResults,
    setSearchResults,
    groupResults,
    setGroupResults,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    searchTimeoutRef,
    dropdownRef,
    searchContacts,
  } = useRecipientSearch();

  const dispatch = useMemo<DispatchFns>(
    () => ({ onRecipientsChange, onCcChange, onBccChange }),
    [onRecipientsChange, onCcChange, onBccChange]
  );
  const toTags = useMemo(() => parseEmailsToTags(replyRecipients), [replyRecipients]);
  const ccTags = useMemo(() => parseEmailsToTags(replyCc), [replyCc]);
  const bccTags = useMemo(() => parseEmailsToTags(replyBcc), [replyBcc]);

  const handleRemoveTag = useCallback(
    (index: number, field: FieldType) => applyRemoveTag(index, field, { toTags, ccTags, bccTags }, dispatch),
    [toTags, ccTags, bccTags, dispatch]
  );

  const handleSelectContact = useCallback(
    (contact: Contact, field: FieldType) => {
      applySelectContact(contact, field, { toTags, ccTags, bccTags }, dispatch);
      setInputValues(prev => ({ ...prev, [field]: '' }));
      setSearchResults([]);
      setGroupResults([]);
      setActiveField(null);
    },
    [toTags, ccTags, bccTags, dispatch, setSearchResults, setGroupResults, setActiveField]
  );

  // Expands a contact group into its individual members, adding each to the field.
  const handleSelectGroup = useCallback(
    (group: ContactGroup, field: FieldType) => {
      const current = getTagsForField(field, toTags, ccTags, bccTags);
      const memberTags = group.members.map(member => formatRecipientDisplay(member.name, member.email));
      const newTags = [...current, ...memberTags];
      dispatchToField(field, newTags.join(', '), dispatch);
      setInputValues(prev => ({ ...prev, [field]: '' }));
      setSearchResults([]);
      setGroupResults([]);
      setActiveField(null);
    },
    [toTags, ccTags, bccTags, dispatch, setSearchResults, setGroupResults, setActiveField]
  );

  // Merged suggestions: groups first, then contacts
  const recipientSuggestions: RecipientSuggestion[] = useMemo(
    () => [
      ...groupResults.map((grp): RecipientSuggestion => ({ kind: 'group', group: grp })),
      ...searchResults.map((contact): RecipientSuggestion => ({ kind: 'contact', contact })),
    ],
    [groupResults, searchResults]
  );

  const handleInputChange = useCallback(
    (value: string, field: FieldType) =>
      processFieldInputChange({
        value,
        field,
        toTags,
        ccTags,
        bccTags,
        dispatch,
        searchTimeoutRef,
        searchContacts,
        setInputValues,
        setActiveField,
      }),
    [toTags, ccTags, bccTags, dispatch, searchContacts, setActiveField, searchTimeoutRef]
  );

  const handleKeyDown = useCallback(
    (
      event: React.KeyboardEvent,
      field: FieldType,
      selectedIdx: number,
      handleRemoveTagLocal: (i: number, f: FieldType) => void
    ) => {
      processRecipientKeyDown({
        event,
        field,
        inputValue: inputValues[field],
        suggestions: recipientSuggestions,
        selectedIdx,
        toTags,
        ccTags,
        bccTags,
        dispatch,
        handleRemoveTagFn: handleRemoveTagLocal,
        handleSelectContactFn: handleSelectContact,
        handleSelectGroupFn: handleSelectGroup,
        setInputValues,
        setSearchResults,
        setGroupResults,
        setSelectedSuggestionIndex,
        setActiveField,
      });
    },
    [
      inputValues,
      recipientSuggestions,
      toTags,
      ccTags,
      bccTags,
      dispatch,
      handleSelectContact,
      handleSelectGroup,
      setSearchResults,
      setGroupResults,
      setSelectedSuggestionIndex,
      setActiveField,
    ]
  );

  const handleBlur = useCallback(
    (field: FieldType) =>
      processFieldBlur({
        field,
        inputValues,
        toTags,
        ccTags,
        bccTags,
        dispatch,
        setInputValues,
        setSearchResults,
        setGroupResults,
        setActiveField,
      }),
    [inputValues, toTags, ccTags, bccTags, dispatch, setSearchResults, setGroupResults, setActiveField]
  );

  // ── Drag-and-drop state ─────────────────────────────────────────────────────
  const [dragSource, setDragSource] = useState<{ field: FieldType; index: number } | null>(null);

  const handleDragStart = useCallback((field: FieldType, index: number) => {
    setDragSource({ field, index });
  }, []);

  const handleDrop = useCallback(
    (targetField: FieldType) => {
      if (!dragSource || dragSource.field === targetField) {
        setDragSource(null);
        return;
      }
      const sourceTags = getTagsForField(dragSource.field, toTags, ccTags, bccTags);
      const movedTag = sourceTags[dragSource.index];
      if (!movedTag) {
        setDragSource(null);
        return;
      }
      // Remove from source field
      const newSourceTags = sourceTags.filter((_, i) => i !== dragSource.index);
      dispatchToField(dragSource.field, newSourceTags.join(', '), dispatch);
      // Add to target field
      const targetTags = getTagsForField(targetField, toTags, ccTags, bccTags);
      dispatchToField(targetField, [...targetTags, movedTag].join(', '), dispatch);
      setDragSource(null);
    },
    [dragSource, toTags, ccTags, bccTags, dispatch]
  );

  return {
    toTags,
    ccTags,
    bccTags,
    activeField,
    setActiveField,
    searchResults,
    setSearchResults,
    groupResults,
    recipientSuggestions,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    inputValues,
    setInputValues,
    dropdownRef,
    handleInputChange,
    handleKeyDown,
    handleSelectContact,
    handleSelectGroup,
    handleRemoveTag,
    handleBlur,
    dragSource,
    handleDragStart,
    handleDrop,
  } as const;
};
