import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBriefcase, FiPlus, FiDollarSign } from 'react-icons/fi';
import axios from 'axios';
import { theme } from 'theme/theme';
import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { API_URL } from 'config/api';
import { Deal } from 'types/deal';
import { STRING_EN_US, STRING_ES, STRING_ES_ES, STRING_USD, STRING_CURRENCY } from 'constants/strings';
import { COLOR_NAMED_WHITE } from 'constants/colors';

const CRM_ACCENT = '#8B5CF6'; // Purple for CRM
const CRM_BG = '#F5F3FF'; // Light purple background

interface CRMDealsSectionProps {
  senderEmail?: string;
  contactId?: string;
  emailSubject?: string;
}

export const CRMDealsSection: React.FC<CRMDealsSectionProps> = ({
  senderEmail,
  contactId,
  emailSubject,
}) => {
  const { t, i18n } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchDeals = useCallback(async () => {
    if (!senderEmail && !contactId) return;
    
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

  // Fetch deals when expanding for the first time
  useEffect(() => {
    if (!isCollapsed && !hasFetched) {
      fetchDeals();
    }
  }, [isCollapsed, hasFetched, fetchDeals]);

  // Don't render if we don't have a sender email or contact ID
  if (!senderEmail && !contactId) {
    return null;
  }

  const locale = i18n.language === STRING_ES ? STRING_ES_ES : STRING_EN_US;

  const formatCurrency = (value: number | null, currency: string | null) => {
    if (value === null) return null;
    const currencyCode = currency || STRING_USD;
    return new Intl.NumberFormat(locale, {
      style: STRING_CURRENCY,
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const totalValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
  const dealCountText = deals.length === 1 ? t('crm.deal') : t('crm.deals');
  const totalValueText = totalValue > 0 ? ` · ${formatCurrency(totalValue, STRING_USD)}` : '';
  const dealsText = `${deals.length} ${dealCountText}${totalValueText}`;
  let preview: string;
  if (loading) {
    preview = t('common.loading');
  } else if (deals.length === 0) {
    preview = t('crm.noDeals');
  } else {
    preview = dealsText;
  }

  const controls = (
    <button
      onClick={(e) => { 
        e.stopPropagation(); 
        // Could open a "create deal" modal in the future
      }}
      style={{
        background: 'transparent',
        border: 'none',
        color: theme.colors.text.secondary,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
        padding: theme.spacing.xs,
        display: 'flex',
        alignItems: 'center',
      }}
      title={t('crm.createDeal')}
    >
      <FiPlus size={16} />
    </button>
  );

  return (
    <CollapsibleSection
      icon={<FiBriefcase size={18} />}
      title={t('crm.deals')}
      isCollapsed={isCollapsed}
      onToggle={() => setIsCollapsed(!isCollapsed)}
      accentColor={CRM_ACCENT}
      backgroundColor={CRM_BG}
      preview={preview}
      controls={controls}
    >
      {loading && (
        <div style={{
          padding: theme.spacing.md,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
        }}>
          {t('common.loading')}
        </div>
      )}
      {!loading && error && (
        <div style={{
          padding: theme.spacing.md,
          color: theme.colors.error.main,
          fontSize: theme.typography.fontSize.sm,
        }}>
          {error}
        </div>
      )}
      {!loading && !error && deals.length === 0 && (
        <div style={{
          padding: theme.spacing.md,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          textAlign: 'center',
        }}>
          {t('crm.noDealsWithContact')}
        </div>
      )}
      {!loading && !error && deals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          {deals.map((deal) => (
            <div
              key={deal.id}
              style={{
                padding: theme.spacing.md,
                backgroundColor: COLOR_NAMED_WHITE,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border.light}`,
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: theme.spacing.sm,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: theme.typography.fontWeight.semibold,
                    fontSize: theme.typography.fontSize.sm,
                    color: theme.colors.text.primary,
                    marginBottom: theme.spacing.xs,
                  }}>
                    {deal.title}
                  </div>
                  {deal.stageName && (
                    <span style={{
                      display: 'inline-block',
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: CRM_BG,
                      color: CRM_ACCENT,
                      borderRadius: theme.borderRadius.sm,
                      fontSize: theme.typography.fontSize.xs,
                      fontWeight: theme.typography.fontWeight.medium,
                    }}>
                      {deal.stageName}
                    </span>
                  )}
                </div>
                {deal.value !== null && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                    color: theme.colors.success.main,
                    fontWeight: theme.typography.fontWeight.semibold,
                    fontSize: theme.typography.fontSize.sm,
                  }}>
                    <FiDollarSign size={14} />
                    {formatCurrency(deal.value, deal.currency)}
                  </div>
                )}
              </div>
              {deal.expectedCloseDate && (
                <div style={{
                  marginTop: theme.spacing.sm,
                  fontSize: theme.typography.fontSize.xs,
                  color: theme.colors.text.tertiary,
                }}>
                  {t('crm.expectedClose')}: {formatDate(deal.expectedCloseDate)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
};
