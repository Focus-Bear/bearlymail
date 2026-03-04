import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { Deal, DealStage } from 'types/deal';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { OPACITY_FULL,OPACITY_HALF } from 'constants/numbers';
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
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectableContacts = useMemo(
    () => contacts.filter((c): c is Contact & { id: string } => Boolean(c.id)),
    [contacts]
  );

  const filteredContacts = useMemo(() => {
    const searchQuery = contactSearchTerm.trim().toLowerCase();
    if (!searchQuery) return selectableContacts;
    return selectableContacts.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      return name.includes(searchQuery) || email.includes(searchQuery);
    });
  }, [selectableContacts, contactSearchTerm]);

  const contactLabelById = useMemo(
    () => new Map(selectableContacts.map((c) => [c.id, c.name || c.email])),
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

  useEffect(() => { setHighlightedIndex(-1); }, [contactSearchTerm, isOpen]);

  const close = () => { setIsOpen(false); setContactSearchTerm(''); setHighlightedIndex(-1); };
  const toggle = () => { setIsOpen((prev) => { if (prev) { setContactSearchTerm(''); setHighlightedIndex(-1); } return !prev; }); };
  const select = (id: string) => { onContactSelected(id); close(); };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const maxIndex = filteredContacts.length;
    if (event.key === KEY_ESCAPE) { event.preventDefault(); close(); return; }
    if (event.key === KEY_ARROW_DOWN) {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev >= maxIndex ? 0 : prev + 1));
      return;
    }
    if (event.key === KEY_ARROW_UP) {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? maxIndex : prev - 1));
      return;
    }
    if (event.key === KEY_ENTER && highlightedIndex >= 0) {
      event.preventDefault();
      if (highlightedIndex === 0) { select(''); return; }
      const chosen = filteredContacts[highlightedIndex - 1];
      if (chosen) { select(chosen.id); }
    }
  };

  const triggerColor = selectedContactLabel ? theme.colors.text.primary : theme.colors.text.tertiary;

  return (
    <div ref={dropdownRef}>
      <label style={labelStyle}>{label}</label>
      <button
        type="button"
        onClick={toggle}
        style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls="deal-contact-listbox"
        aria-expanded={isOpen}
      >
        <span style={{ color: triggerColor }}>{selectedContactLabel || '--'}</span>
        <span style={{ color: theme.colors.text.tertiary }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div style={{
          marginTop: theme.spacing.xs,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.background.paper,
          boxShadow: theme.shadows.lg,
          overflow: 'hidden',
          position: 'relative',
          zIndex: 20,
        }}>
          <div style={{ padding: theme.spacing.sm, borderBottom: `1px solid ${theme.colors.border.light}` }}>
            <input
              ref={searchInputRef}
              value={contactSearchTerm}
              onChange={(e) => setContactSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              style={inputStyle}
            />
          </div>
          <div id="deal-contact-listbox" style={{ maxHeight: '220px', overflowY: 'auto' }} role="listbox">
            <button
              type="button"
              role="option"
              aria-selected={contactId === ''}
              onMouseEnter={() => setHighlightedIndex(0)}
              onClick={() => select('')}
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
            {filteredContacts.map((c, index) => {
              const optionIndex = index + 1;
              const isHighlighted = highlightedIndex === optionIndex;
              const isSelected = c.id === contactId;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(optionIndex)}
                  onClick={() => select(c.id)}
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
                  {c.name || c.email}
                </button>
              );
            })}
            {filteredContacts.length === 0 && (
              <div style={{ padding: theme.spacing.md, color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
                {noResultsText}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const DealFormModal: React.FC<DealFormModalProps> = ({
  deal,
  stages,
  contacts,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(deal?.title || '');
  const [details, setDetails] = useState(deal?.details || '');
  const [value, setValue] = useState(deal?.value?.toString() || '');
  const [currency, setCurrency] = useState(deal?.currency || 'USD');
  const [stageId, setStageId] = useState(deal?.stageId || stages[0]?.id || '');
  const [contactId, setContactId] = useState(deal?.contactId || '');
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    deal?.expectedCloseDate ? deal.expectedCloseDate.split('T')[0] : ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: theme.spacing.sm,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSize.base,
    outline: 'none',
    backgroundColor: theme.colors.background.paper,
  };

  const labelStyle: React.CSSProperties = {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    display: 'block',
    marginBottom: theme.spacing.xs,
    fontWeight: theme.typography.fontWeight.medium,
  };

  const canSubmit = Boolean(title.trim());

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
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
        <h2 style={{ ...theme.typography.heading.h5, color: theme.colors.text.primary, margin: 0, marginBottom: theme.spacing.lg }}>
          {deal ? t('deals.editDeal') : t('deals.addDeal')}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            <div>
              <label style={labelStyle}>{t('deals.dealTitle')} *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} required autoFocus />
            </div>

            <div>
              <label style={labelStyle}>{t('deals.dealDetails')}</label>
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} rows={3} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: theme.spacing.md }}>
              <div>
                <label style={labelStyle}>{t('deals.dealValue')}</label>
                <input type="number" step="0.01" min="0" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} placeholder="0.00" />
              </div>
              <div>
                <label style={labelStyle}>{t('deals.currency')}</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
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
              <label style={labelStyle}>{t('deals.dealStage')}</label>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
            </div>

            <ContactDropdownField
              contacts={contacts}
              contactId={contactId}
              onContactSelected={setContactId}
              label={t('deals.contact')}
              inputStyle={inputStyle}
              labelStyle={labelStyle}
              searchPlaceholder={t('deals.searchContacts')}
              noResultsText={t('deals.noContactsFound')}
            />

            <div>
              <label style={labelStyle}>{t('deals.expectedClose')}</label>
              <input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

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
        </form>
      </div>
    </div>
  );
};
