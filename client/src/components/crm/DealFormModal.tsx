import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Deal, DealStage } from 'types/deal';
import { Contact } from 'types/contact';
import { OPACITY_HALF, OPACITY_FULL } from 'constants/numbers';

interface DealFormModalProps {
  deal: Deal | null;
  stages: DealStage[];
  contacts: Contact[];
  onSave: (data: {
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
  const [stageId, setStageId] = useState(deal?.stageId || (stages[0]?.id || ''));
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
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>{t('deals.contact')}</label>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">--</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.email}</option>
                ))}
              </select>
            </div>

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
                backgroundColor: 'transparent',
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
              disabled={!title.trim()}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: title.trim() ? 'pointer' : 'not-allowed',
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.medium,
                opacity: title.trim() ? OPACITY_FULL : OPACITY_HALF,
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
