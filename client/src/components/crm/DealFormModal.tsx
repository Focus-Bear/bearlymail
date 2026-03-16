import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { Deal, DealStage } from 'types/deal';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { OPACITY_FULL, OPACITY_HALF } from 'constants/numbers';
import { KEY_ARROW_DOWN, KEY_ARROW_UP, KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

interface DealFormModalProps {
  deal: Deal | null;
  stages: DealStage[];
  contacts: Contact[];
  onSave: (payload: {
    title: string;
    details?: string;
    value?: number;
    currency?: string;
    stageId?: string;
    contactId?: string;
    expectedCloseDate?: string;
  }) => void;
  onClose: () => void;
}

interface ContactDropdownFieldProps {
  contacts: Contact[];
  contactId: string;
  onContactSelected: (id: string) => void;
  label: string;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  searchPlaceholder: string;
  noResultsText: string;
}

// Module-level style constants shared across ContactDropdownField and DealFormModal
const DEAL_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.base,
  outline: 'none',
  backgroundColor: theme.colors.background.paper,
};

const DEAL_LABEL_STYLE: React.CSSProperties = {
  color: theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.sm,
  display: 'block',
  marginBottom: theme.spacing.xs,
  fontWeight: theme.typography.fontWeight.medium,
};

interface ContactOptionsListProps {
  filteredContacts: (Contact & { id: string })[];
  contactId: string;
  highlightedIndex: number;
  noResultsText: string;
  onHighlight: (index: number) => void;
  onSelect: (id: string) => void;
}

const ContactOptionsList: React.FC<ContactOptionsListProps> = ({
  filteredContacts,
  contactId,
  highlightedIndex,
  noResultsText,
  onHighlight,
  onSelect,
}) => (
  <>
    <button
      type="button"
      role="option"
      aria-selected={contactId === ''}
      onMouseEnter={() => onHighlight(0)}
      onClick={() => onSelect('')}
      style={{
        width: '100%',
        border: STRING_NONE,
        backgroundColor: highlightedIndex === 0 || contactId === '' ? theme.colors.background.subtle : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        fontSize: theme.typography.fontSize.base,
        color: theme.colors.text.primary,
      }}
    >
      --
    </button>
    {filteredContacts.map((contact, index) => {
      const optionIndex = index + 1;
      const isHighlighted = highlightedIndex === optionIndex;
      const isSelected = contact.id === contactId;
      return (
        <button
          key={contact.id}
          type="button"
          role="option"
          aria-selected={isSelected}
          onMouseEnter={() => onHighlight(optionIndex)}
          onClick={() => onSelect(contact.id)}
          style={{
            width: '100%',
            border: STRING_NONE,
            backgroundColor: isHighlighted || isSelected ? theme.colors.background.subtle : 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.primary,
          }}
        >
          {contact.name || contact.email}
        </button>
      );
    })}
    {filteredContacts.length === 0 && (
      <div
        style={{
          padding: theme.spacing.md,
          color: theme.colors.text.tertiary,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {noResultsText}
      </div>
    )}
  </>
);

interface ContactDropdownPanelProps {
  filteredContacts: (Contact & { id: string })[];
  contactId: string;
  contactSearchTerm: string;
  highlightedIndex: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  inputStyle: React.CSSProperties;
  searchPlaceholder: string;
  noResultsText: string;
  onSearchChange: (term: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onHighlight: (index: number) => void;
  onSelect: (id: string) => void;
}

const ContactDropdownPanel: React.FC<ContactDropdownPanelProps> = ({
  filteredContacts,
  contactId,
  contactSearchTerm,
  highlightedIndex,
  searchInputRef,
  inputStyle,
  searchPlaceholder,
  noResultsText,
  onSearchChange,
  onKeyDown,
  onHighlight,
  onSelect,
}) => (
  <div
    style={{
      marginTop: theme.spacing.xs,
      border: `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.background.paper,
      boxShadow: theme.shadows.lg,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 20,
    }}
  >
    <div style={{ padding: theme.spacing.sm, borderBottom: `1px solid ${theme.colors.border.light}` }}>
      <input
        ref={searchInputRef}
        value={contactSearchTerm}
        onChange={event => onSearchChange(event.target.value)}
        onKeyDown={onKeyDown}
        aria-label={searchPlaceholder}
        placeholder={searchPlaceholder}
        style={inputStyle}
      />
    </div>
    <div id="deal-contact-listbox" style={{ maxHeight: '220px', overflowY: 'auto' }} role="listbox">
      <ContactOptionsList
        filteredContacts={filteredContacts}
        contactId={contactId}
        highlightedIndex={highlightedIndex}
        noResultsText={noResultsText}
        onHighlight={onHighlight}
        onSelect={onSelect}
      />
    </div>
  </div>
);

interface ContactDropdownState {
  isOpen: boolean;
  contactSearchTerm: string;
  highlightedIndex: number;
  filteredContacts: (Contact & { id: string })[];
  selectedContactLabel: string;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  toggle: () => void;
  select: (id: string) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  setContactSearchTerm: (term: string) => void;
  setHighlightedIndex: (index: number) => void;
}

function useContactDropdown(
  contacts: Contact[],
  contactId: string,
  onContactSelected: (id: string) => void
): ContactDropdownState {
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectableContacts = useMemo(
    () => contacts.filter((contact): contact is Contact & { id: string } => Boolean(contact.id)),
    [contacts]
  );

  const filteredContacts = useMemo(() => {
    const searchQuery = contactSearchTerm.trim().toLowerCase();
    if (!searchQuery) {
      return selectableContacts;
    }
    return selectableContacts.filter(contact => {
      const name = (contact.name || '').toLowerCase();
      const email = (contact.email || '').toLowerCase();
      return name.includes(searchQuery) || email.includes(searchQuery);
    });
  }, [selectableContacts, contactSearchTerm]);

  const contactLabelById = useMemo(
    () => new Map(selectableContacts.map(contact => [contact.id, contact.name || contact.email])),
    [selectableContacts]
  );

  const selectedContactLabel = contactId ? contactLabelById.get(contactId) || '' : '';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [contactSearchTerm, isOpen]);

  const close = () => {
    setIsOpen(false);
    setContactSearchTerm('');
    setHighlightedIndex(-1);
  };

  const toggle = () => {
    setIsOpen(prev => {
      if (prev) {
        setContactSearchTerm('');
        setHighlightedIndex(-1);
      }
      return !prev;
    });
  };

  const select = (id: string) => {
    onContactSelected(id);
    close();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const maxIndex = filteredContacts.length;
    if (event.key === KEY_ESCAPE) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === KEY_ARROW_DOWN) {
      event.preventDefault();
      setHighlightedIndex(prev => (prev >= maxIndex ? 0 : prev + 1));
      return;
    }
    if (event.key === KEY_ARROW_UP) {
      event.preventDefault();
      setHighlightedIndex(prev => (prev <= 0 ? maxIndex : prev - 1));
      return;
    }
    if (event.key === KEY_ENTER && highlightedIndex >= 0) {
      event.preventDefault();
      if (highlightedIndex === 0) {
        select('');
        return;
      }
      const chosen = filteredContacts[highlightedIndex - 1];
      if (chosen) {
        select(chosen.id);
      }
    }
  };

  return {
    isOpen,
    contactSearchTerm,
    highlightedIndex,
    filteredContacts,
    selectedContactLabel,
    dropdownRef,
    searchInputRef,
    toggle,
    select,
    handleKeyDown,
    setContactSearchTerm,
    setHighlightedIndex,
  };
}

const ContactDropdownField: React.FC<ContactDropdownFieldProps> = ({
  contacts,
  contactId,
  onContactSelected,
  label,
  inputStyle,
  labelStyle,
  searchPlaceholder,
  noResultsText,
}) => {
  const {
    isOpen,
    contactSearchTerm,
    highlightedIndex,
    filteredContacts,
    selectedContactLabel,
    dropdownRef,
    searchInputRef,
    toggle,
    select,
    handleKeyDown,
    setContactSearchTerm,
    setHighlightedIndex,
  } = useContactDropdown(contacts, contactId, onContactSelected);

  const triggerColor = selectedContactLabel ? theme.colors.text.primary : theme.colors.text.tertiary;

  return (
    <div ref={dropdownRef}>
      <label style={labelStyle}>{label}</label>
      <button
        type="button"
        onClick={toggle}
        style={{
          ...inputStyle,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls="deal-contact-listbox"
        aria-expanded={isOpen}
      >
        <span style={{ color: triggerColor }}>{selectedContactLabel || '--'}</span>
        <span style={{ color: theme.colors.text.tertiary }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <ContactDropdownPanel
          filteredContacts={filteredContacts}
          contactId={contactId}
          contactSearchTerm={contactSearchTerm}
          highlightedIndex={highlightedIndex}
          searchInputRef={searchInputRef}
          inputStyle={inputStyle}
          searchPlaceholder={searchPlaceholder}
          noResultsText={noResultsText}
          onSearchChange={setContactSearchTerm}
          onKeyDown={handleKeyDown}
          onHighlight={setHighlightedIndex}
          onSelect={select}
        />
      )}
    </div>
  );
};

interface DealFormFieldsProps {
  title: string;
  details: string;
  value: string;
  currency: string;
  stageId: string;
  contactId: string;
  expectedCloseDate: string;
  stages: DealStage[];
  contacts: Contact[];
  setTitle: (v: string) => void;
  setDetails: (v: string) => void;
  setValue: (v: string) => void;
  setCurrency: (v: string) => void;
  setStageId: (v: string) => void;
  setContactId: (v: string) => void;
  setExpectedCloseDate: (v: string) => void;
  t: (key: string) => string;
}

const DealFormFields: React.FC<DealFormFieldsProps> = ({
  title,
  details,
  value,
  currency,
  stageId,
  contactId,
  expectedCloseDate,
  stages,
  contacts,
  setTitle,
  setDetails,
  setValue,
  setCurrency,
  setStageId,
  setContactId,
  setExpectedCloseDate,
  t,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
    <div>
      <label style={DEAL_LABEL_STYLE}>{t('deals.dealTitle')} *</label>
      <input
        value={title}
        onChange={event => setTitle(event.target.value)}
        style={DEAL_INPUT_STYLE}
        required
        autoFocus
      />
    </div>
    <div>
      <label style={DEAL_LABEL_STYLE}>{t('deals.dealDetails')}</label>
      <textarea
        value={details}
        onChange={event => setDetails(event.target.value)}
        style={{ ...DEAL_INPUT_STYLE, resize: 'vertical' }}
        rows={3}
      />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: theme.spacing.md }}>
      <div>
        <label style={DEAL_LABEL_STYLE}>{t('deals.dealValue')}</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={event => setValue(event.target.value)}
          style={DEAL_INPUT_STYLE}
          placeholder="0.00"
        />
      </div>
      <div>
        <label style={DEAL_LABEL_STYLE}>{t('deals.currency')}</label>
        <select
          value={currency}
          onChange={event => setCurrency(event.target.value)}
          style={{ ...DEAL_INPUT_STYLE, cursor: 'pointer' }}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="AUD">AUD</option>
          <option value="CAD">CAD</option>
          <option value="JPY">JPY</option>
        </select>
      </div>
    </div>
    <div>
      <label style={DEAL_LABEL_STYLE}>{t('deals.dealStage')}</label>
      <select
        value={stageId}
        onChange={event => setStageId(event.target.value)}
        style={{ ...DEAL_INPUT_STYLE, cursor: 'pointer' }}
      >
        {stages.map(stage => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
    </div>
    <ContactDropdownField
      contacts={contacts}
      contactId={contactId}
      onContactSelected={setContactId}
      label={t('deals.contact')}
      inputStyle={DEAL_INPUT_STYLE}
      labelStyle={DEAL_LABEL_STYLE}
      searchPlaceholder={t('deals.searchContacts')}
      noResultsText={t('deals.noContactsFound')}
    />
    <div>
      <label style={DEAL_LABEL_STYLE}>{t('deals.expectedClose')}</label>
      <input
        type="date"
        value={expectedCloseDate}
        onChange={event => setExpectedCloseDate(event.target.value)}
        style={DEAL_INPUT_STYLE}
      />
    </div>
  </div>
);

interface DealFormActionsProps {
  onClose: () => void;
  canSubmit: boolean;
  t: (key: string) => string;
}

const DealFormActions: React.FC<DealFormActionsProps> = ({ onClose, canSubmit, t }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
    <button
      type="button"
      onClick={onClose}
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
        backgroundColor: COLOR_TRANSPARENT,
        color: theme.colors.text.secondary,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.base,
      }}
    >
      {t('deals.cancel')}
    </button>
    <button
      type="submit"
      disabled={!canSubmit}
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
        backgroundColor: theme.colors.primary.main,
        color: COLOR_NAMED_WHITE,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        cursor: canSubmit ? 'pointer' : 'not-allowed',
        fontSize: theme.typography.fontSize.base,
        fontWeight: theme.typography.fontWeight.medium,
        opacity: canSubmit ? OPACITY_FULL : OPACITY_HALF,
      }}
    >
      {t('deals.save')}
    </button>
  </div>
);

interface DealFormState {
  title: string;
  details: string;
  value: string;
  currency: string;
  stageId: string;
  contactId: string;
  expectedCloseDate: string;
  setTitle: (v: string) => void;
  setDetails: (v: string) => void;
  setValue: (v: string) => void;
  setCurrency: (v: string) => void;
  setStageId: (v: string) => void;
  setContactId: (v: string) => void;
  setExpectedCloseDate: (v: string) => void;
}

function useDealFormState(deal: Deal | null, stages: DealStage[]): DealFormState {
  const [title, setTitle] = useState(deal?.title || '');
  const [details, setDetails] = useState(deal?.details || '');
  const [value, setValue] = useState(deal?.value?.toString() || '');
  const [currency, setCurrency] = useState(deal?.currency || 'USD');
  const [stageId, setStageId] = useState(deal?.stageId || stages[0]?.id || '');
  const [contactId, setContactId] = useState(deal?.contactId || '');
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    deal?.expectedCloseDate ? deal.expectedCloseDate.split('T')[0] : ''
  );
  return {
    title,
    details,
    value,
    currency,
    stageId,
    contactId,
    expectedCloseDate,
    setTitle,
    setDetails,
    setValue,
    setCurrency,
    setStageId,
    setContactId,
    setExpectedCloseDate,
  };
}

export const DealFormModal: React.FC<DealFormModalProps> = ({ deal, stages, contacts, onSave, onClose }) => {
  const { t } = useTranslation();
  const formState = useDealFormState(deal, stages);
  const { title, details, value, currency, stageId, contactId, expectedCloseDate } = formState;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onSave({
      title: title.trim(),
      details: details.trim() || undefined,
      value: value ? parseFloat(value) : undefined,
      currency,
      stageId: stageId || undefined,
      contactId: contactId || undefined,
      expectedCloseDate: expectedCloseDate || undefined,
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          padding: theme.spacing.xl,
          width: '500px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h2
          style={{
            ...theme.typography.heading.h5,
            color: theme.colors.text.primary,
            margin: 0,
            marginBottom: theme.spacing.lg,
          }}
        >
          {deal ? t('deals.editDeal') : t('deals.addDeal')}
        </h2>
        <form onSubmit={handleSubmit}>
          <DealFormFields {...formState} stages={stages} contacts={contacts} t={t} />
          <DealFormActions onClose={onClose} canSubmit={Boolean(title.trim())} t={t} />
        </form>
      </div>
    </div>
  );
};
