import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBriefcase, FiDollarSign, FiPlus } from 'react-icons/fi';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  prefetchDealFormData,
  useContactForEmailQuery,
  useContactListQuery,
  useDealStagesQuery,
} from 'queries/dealFormData';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { Deal, DealStage } from 'types/deal';
import { formatDealAmount } from 'utils/formatDealAmount';

import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { DealFormModal } from 'components/crm/DealFormModal';
import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_EN_US, STRING_ES, STRING_ES_ES, STRING_USD } from 'constants/strings';

const CRM_ACCENT = '#8B5CF6'; // Purple for CRM
const CRM_BG = '#F5F3FF'; // Light purple background
// Stable empty lists so the form's props don't change identity on every render while a lookup is pending.
const EMPTY_STAGES: DealStage[] = [];
const EMPTY_CONTACTS: Contact[] = [];

interface CRMDealsSectionProps {
  senderEmail?: string;
  contactId?: string;
  emailSubject?: string;
  /** When provided, shows a dismiss (X) button on the card header. */
  onDismiss?: () => void;
}

const formatCurrency = (value: number | null, currency: string | null, locale: string): string | null =>
  value === null ? null : formatDealAmount(value, currency, locale);

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

const useCRMDeals = (senderEmail: string | undefined, contactId: string | undefined) => {
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

/** Puts the sender's contact into the picker's list so it can be shown as selected before the full list arrives. */
const includeContact = (contacts: Contact[], contact: Contact | undefined): Contact[] => {
  if (!contact?.id || contacts.some(existing => existing.id === contact.id)) {
    return contacts;
  }
  return [contact, ...contacts];
};

/**
 * Loads what the add-deal form needs — stages, the contact picker's list and
 * the sender's contact (find-or-create, so the deal has something to link to)
 * — WITHOUT holding the form back. Each lookup is cached, so the form opens
 * on click and fills in as the answers land.
 */
const useDealFormData = (senderEmail: string | undefined, contactId: string | undefined, isEnabled: boolean) => {
  const stagesQuery = useDealStagesQuery(isEnabled);
  const contactListQuery = useContactListQuery(isEnabled);
  const senderContactQuery = useContactForEmailQuery(senderEmail, isEnabled && !contactId);

  const contacts = useMemo(
    () => includeContact(contactListQuery.data ?? EMPTY_CONTACTS, senderContactQuery.data),
    [contactListQuery.data, senderContactQuery.data]
  );

  return {
    stages: stagesQuery.data ?? EMPTY_STAGES,
    contacts,
    formContactId: contactId ?? senderContactQuery.data?.id ?? '',
    // Save waits only for the sender's contact, so the deal is linked to it. A deal saved
    // before the stages arrive gets the first stage server-side, the same default the form shows.
    isResolvingContact: senderContactQuery.isFetching && !senderContactQuery.data,
    hasLoadError: stagesQuery.isError || contactListQuery.isError || senderContactQuery.isError,
  };
};

/**
 * Drives the "add a deal from the email view" flow behind the Deals section's
 * "+" button. `onCreated` refreshes the section's deal list.
 */
const useAddDealFlow = (senderEmail: string | undefined, contactId: string | undefined, onCreated: () => void) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const formData = useDealFormData(senderEmail, contactId, isFormOpen);

  const prefetch = useCallback(() => prefetchDealFormData(queryClient), [queryClient]);

  const openForm = useCallback(() => {
    setSaveError(null);
    setIsFormOpen(true);
  }, []);

  const closeForm = useCallback(() => setIsFormOpen(false), []);

  const saveDeal = useCallback(
    async (payload: DealPayload) => {
      setIsSaving(true);
      setSaveError(null);
      try {
        await axios.post(`${API_URL}/deals`, payload);
        setIsFormOpen(false);
        onCreated();
      } catch (err) {
        // The form stays open with everything typed so far; only the error is added.
        console.error('Error creating deal:', err);
        setSaveError(t('crm.errorCreatingDeal'));
      } finally {
        setIsSaving(false);
      }
    },
    [onCreated, t]
  );

  const loadError = formData.hasLoadError ? t('crm.errorLoadingDealForm') : null;

  return {
    isFormOpen,
    stages: formData.stages,
    contacts: formData.contacts,
    formContactId: formData.formContactId,
    isSubmitBlocked: formData.isResolvingContact || isSaving,
    formError: saveError ?? loadError,
    prefetch,
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

  const {
    isFormOpen,
    stages,
    contacts,
    formContactId,
    isSubmitBlocked,
    formError,
    prefetch,
    openForm,
    closeForm,
    saveDeal,
  } = useAddDealFlow(senderEmail, contactId, onDealCreated);

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
      onPointerEnter={prefetch}
      onFocus={prefetch}
      title={t('crm.createDeal')}
      aria-label={t('crm.createDeal')}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
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
        <DealSectionContent loading={loading} error={error} deals={deals} locale={locale} t={t} />
      </CollapsibleSection>
      {isFormOpen && (
        <DealFormModal
          deal={null}
          stages={stages}
          contacts={contacts}
          initialContactId={formContactId}
          isSubmitBlocked={isSubmitBlocked}
          errorMessage={formError}
          onSave={saveDeal}
          onClose={closeForm}
        />
      )}
    </>
  );
};
