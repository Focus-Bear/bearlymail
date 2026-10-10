import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBriefcase, FiDollarSign, FiPlus } from 'react-icons/fi';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { Deal, DealStage } from 'types/deal';

import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { DealFormModal } from 'components/crm/DealFormModal';
import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_CURRENCY, STRING_EN_US, STRING_ES, STRING_ES_ES, STRING_USD } from 'constants/strings';

const CRM_ACCENT = '#8B5CF6'; // Purple for CRM
const CRM_BG = '#F5F3FF'; // Light purple background

interface CRMDealsSectionProps {
  senderEmail?: string;
  contactId?: string;
  emailSubject?: string;
  /** When provided, shows a dismiss (X) button on the card header. */
  onDismiss?: () => void;
}

const formatCurrency = (value: number | null, currency: string | null, locale: string): string | null => {
  if (value === null) {
    return null;
  }
  const currencyCode = currency || STRING_USD;
  return new Intl.NumberFormat(locale, {
    style: STRING_CURRENCY,
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDate = (dateStr: string | null, locale: string): string | null => {
  if (!dateStr) {
    return null;
  }
  return new Date(dateStr).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
};

interface DealCardProps {
  deal: Deal;
  locale: string;
  t: (key: string) => string;
}

const DealCard: React.FC<DealCardProps> = ({ deal, locale, t }) => (
  <div
    style={{
      padding: theme.spacing.md,
      backgroundColor: COLOR_NAMED_WHITE,
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${theme.colors.border.light}`,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: theme.typography.fontWeight.semibold,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
          }}
        >
          {deal.title}
        </div>
        {deal.stageName && (
          <span
            style={{
              display: 'inline-block',
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: CRM_BG,
              color: CRM_ACCENT,
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.xs,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {deal.stageName}
          </span>
        )}
      </div>
      {deal.value !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            color: theme.colors.success.main,
            fontWeight: theme.typography.fontWeight.semibold,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          <FiDollarSign size={14} />
          {formatCurrency(deal.value, deal.currency, locale)}
        </div>
      )}
    </div>
    {deal.expectedCloseDate && (
      <div
        style={{
          marginTop: theme.spacing.sm,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
        }}
      >
        {t('crm.expectedClose')}: {formatDate(deal.expectedCloseDate, locale)}
      </div>
    )}
  </div>
);

interface DealSectionContentProps {
  loading: boolean;
  error: string | null;
  deals: Deal[];
  locale: string;
  t: (key: string) => string;
}

const DealSectionContent: React.FC<DealSectionContentProps> = ({ loading, error, deals, locale, t }) => {
  if (loading) {
    return (
      <div
        style={{
          padding: theme.spacing.md,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('common.loading')}
      </div>
    );
  }
  if (error) {
    return (
      <div
        style={{ padding: theme.spacing.md, color: theme.colors.error.main, fontSize: theme.typography.fontSize.sm }}
      >
        {error}
      </div>
    );
  }
  if (deals.length === 0) {
    return (
      <div
        style={{
          padding: theme.spacing.md,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          textAlign: 'center',
        }}
      >
        {t('crm.noDealsWithContact')}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      {deals.map(deal => (
        <DealCard key={deal.id} deal={deal} locale={locale} t={t} />
      ))}
    </div>
  );
};

const useCRMDeals =(senderEmail: string | undefined, contactId: string | undefined) => {
  const { t } = useTranslation();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchDeals = useCallback(async () => {
    if (!senderEmail && !contactId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let response;
      if (contactId) {
        response = await axios.get(`${API_URL}/deals/by-contact/${contactId}`);
      } else if (senderEmail) {
        response = await axios.get(`${API_URL}/deals/by-email/${encodeURIComponent(senderEmail)}`);
      }
      if (response?.data) {
        setDeals(response.data);
      }
    } catch (err) {
      console.error('Error fetching deals:', err);
      setError(t('crm.errorLoadingDeals'));
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [senderEmail, contactId, t]);

  return { deals, loading, error, hasFetched, fetchDeals };
};

type DealPayload = {
  title: string;
  details?: string;
  value?: number;
  currency?: string;
  stageId?: string;
  contactId?: string;
  expectedCloseDate?: string;
};

/**
 * Drives the "add a deal from the email view" flow behind the Deals section's
 * "+" button: ensures a Contact exists for the sender (find-or-create by email,
 * so the deal has something to link to), loads the stages + contacts the form
 * needs, and creates the deal. `onCreated` refreshes the section's deal list.
 */
const useAddDealFlow = (
  senderEmail: string | undefined,
  contactId: string | undefined,
  onCreated: () => void
) => {
  const { t } = useTranslation();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [formContactId, setFormContactId] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const openForm = useCallback(async () => {
    setPreparing(true);
    setAddError(null);
    try {
      // Ensure a contact exists for the sender so the deal can link to it.
      // POST /contacts is idempotent on email (find-or-create), so an existing
      // sender isn't duplicated.
      let resolvedContactId = contactId ?? '';
      if (!resolvedContactId && senderEmail) {
        const contactRes = await axios.post(`${API_URL}/contacts`, { email: senderEmail });
        resolvedContactId = contactRes.data?.id ?? '';
      }
      const [stagesRes, contactsRes] = await Promise.all([
        axios.get(`${API_URL}/deals/stages`),
        axios.get(`${API_URL}/contacts`),
      ]);
      setStages(stagesRes.data ?? []);
      setContacts(contactsRes.data ?? []);
      setFormContactId(resolvedContactId);
      setIsFormOpen(true);
    } catch (err) {
      console.error('Error preparing deal form:', err);
      setAddError(t('crm.errorCreatingDeal'));
    } finally {
      setPreparing(false);
    }
  }, [senderEmail, contactId, t]);

  const closeForm = useCallback(() => setIsFormOpen(false), []);

  const saveDeal = useCallback(
    async (payload: DealPayload) => {
      try {
        await axios.post(`${API_URL}/deals`, payload);
        setIsFormOpen(false);
        onCreated();
      } catch (err) {
        console.error('Error creating deal:', err);
        setAddError(t('crm.errorCreatingDeal'));
      }
    },
    [onCreated, t]
  );

  return {
    isFormOpen,
    preparing,
    stages,
    contacts,
    formContactId,
    addError,
    openForm,
    closeForm,
    saveDeal,
  };
};

export const CRMDealsSection: React.FC<CRMDealsSectionProps> = ({ senderEmail, contactId, onDismiss }) => {
  const { t, i18n } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { deals, loading, error, hasFetched, fetchDeals } = useCRMDeals(senderEmail, contactId);

  const onDealCreated = useCallback(() => {
    setIsCollapsed(false); // reveal the list so the new deal is visible
    fetchDeals();
  }, [fetchDeals]);

  const { isFormOpen, preparing, stages, contacts, formContactId, addError, openForm, closeForm, saveDeal } =
    useAddDealFlow(senderEmail, contactId, onDealCreated);

  useEffect(() => {
    if (!isCollapsed && !hasFetched) {
      fetchDeals();
    }
  }, [isCollapsed, hasFetched, fetchDeals]);

  if (!senderEmail && !contactId) {
    return null;
  }

  const locale = i18n.language === STRING_ES ? STRING_ES_ES : STRING_EN_US;
  const totalValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
  const dealCountText = deals.length === 1 ? t('crm.deal') : t('crm.deals');
  const totalValueText = totalValue > 0 ? ` · ${formatCurrency(totalValue, STRING_USD, locale)}` : '';

  let preview: string;
  if (loading) {
    preview = t('common.loading');
  } else if (deals.length === 0) {
    preview = t('crm.noDeals');
  } else {
    preview = `${deals.length} ${dealCountText}${totalValueText}`;
  }

  const addDealControl = (
    <button
      type="button"
      onClick={openForm}
      disabled={preparing}
      title={t('crm.createDeal')}
      aria-label={t('crm.createDeal')}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: preparing ? 'wait' : 'pointer',
        color: CRM_ACCENT,
        display: 'flex',
        alignItems: 'center',
        padding: theme.spacing.xs,
        borderRadius: theme.borderRadius.sm,
      }}
    >
      <FiPlus size={16} />
    </button>
  );

  return (
    <>
      <CollapsibleSection
        icon={<FiBriefcase size={18} />}
        title={t('crm.deals')}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
        accentColor={CRM_ACCENT}
        backgroundColor={CRM_BG}
        preview={preview}
        controls={addDealControl}
        onDismiss={onDismiss}
        dismissTitle={t('emailDetail.hideCard')}
      >
        {addError && (
          <div
            style={{
              padding: theme.spacing.sm,
              marginBottom: theme.spacing.sm,
              color: theme.colors.error.main,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {addError}
          </div>
        )}
        <DealSectionContent loading={loading} error={error} deals={deals} locale={locale} t={t} />
      </CollapsibleSection>
      {isFormOpen && (
        <DealFormModal
          deal={null}
          stages={stages}
          contacts={contacts}
          initialContactId={formContactId}
          onSave={saveDeal}
          onClose={closeForm}
        />
      )}
    </>
  );
};
