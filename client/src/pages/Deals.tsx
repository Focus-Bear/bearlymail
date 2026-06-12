import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { Deal, KanbanBoard } from 'types/deal';

import { DealFormModal } from 'components/crm/DealFormModal';
import { KanbanColumn } from 'components/crm/KanbanColumn';
import { Sidebar } from 'components/inbox/Sidebar';
import { API_URL } from 'config/api';
import { EMOJI_MENU } from 'constants/emojis';
import {
  STRING_AUTO,
  STRING_CENTER,
  STRING_CURRENCY,
  STRING_EN_US,
  STRING_FIXED,
  STRING_FLEX,
  STRING_HIDDEN,
  STRING_NONE,
  STRING_POINTER,
  STRING_USD,
  STRING_WHITE,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';

interface DealsHeaderProps {
  t: (key: string) => string;
  onAddDeal: () => void;
}

const DealsHeader: React.FC<DealsHeaderProps> = ({ t, onAddDeal }) => (
  <div
    style={{
      display: STRING_FLEX,
      justifyContent: 'space-between',
      alignItems: STRING_CENTER,
      marginBottom: theme.spacing.lg,
    }}
  >
    <h1 style={{ ...theme.typography.heading.h4, color: theme.colors.text.primary, margin: 0 }}>{t('deals.title')}</h1>
    <button
      onClick={onAddDeal}
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        backgroundColor: theme.colors.primary.main,
        color: STRING_WHITE,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        cursor: STRING_POINTER,
        fontSize: theme.typography.fontSize.sm,
        fontWeight: theme.typography.fontWeight.medium,
      }}
    >
      {t('deals.addDeal')}
    </button>
  </div>
);

const DealsEmptyState: React.FC<{ t: (key: string) => string }> = ({ t }) => (
  <div
    style={{
      textAlign: STRING_CENTER,
      padding: theme.spacing.xl,
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      boxShadow: theme.shadows.sm,
    }}
  >
    <div style={{ fontSize: '48px', marginBottom: theme.spacing.md }}>🤝</div>
    <h3
      style={{
        color: theme.colors.text.primary,
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.semibold,
        marginBottom: theme.spacing.sm,
      }}
    >
      {t('deals.noDeals')}
    </h3>
    <p
      style={{
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.base,
        marginBottom: theme.spacing.lg,
      }}
    >
      {t('deals.createFirstDeal')}
    </p>
  </div>
);

interface DealsKanbanBoardProps {
  kanban: KanbanBoard;
  draggedDeal: Deal | null;
  onDragStart: (deal: Deal) => void;
  onDragEnd: () => void;
  onDrop: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
  onDeleteDeal: (dealId: string) => void;
  formatCurrency: (value: number, currency?: string | null) => string;
}

const DealsKanbanBoard: React.FC<DealsKanbanBoardProps> = ({
  kanban,
  draggedDeal,
  onDragStart,
  onDragEnd,
  onDrop,
  onEditDeal,
  onDeleteDeal,
  formatCurrency,
}) => (
  <div
    style={{
      display: STRING_FLEX,
      gap: theme.spacing.md,
      overflowX: 'auto',
      paddingBottom: theme.spacing.md,
      minHeight: '400px',
    }}
  >
    {kanban.stages.map(stage => (
      <KanbanColumn
        key={stage.id}
        stage={stage}
        deals={kanban.deals[stage.id] || []}
        total={kanban.totals[stage.id] || 0}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDrop={() => onDrop(stage.id)}
        onEditDeal={onEditDeal}
        onDeleteDeal={onDeleteDeal}
        formatCurrency={formatCurrency}
        isDragOver={draggedDeal !== null && draggedDeal.stageId !== stage.id}
      />
    ))}
  </div>
);

const Deals: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, openMobileMenu, closeMobileMenu } =
    useSidebarState({ alwaysToggleable: true });

  const [kanban, setKanban] = useState<KanbanBoard | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [draggedDeal, setDraggedDeal] = useState<Deal | null>(null);

  const fetchKanban = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/deals/kanban`);
      setKanban(response.data);
    } catch (err) {
      console.error('Failed to fetch kanban:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/contacts`);
      setContacts(response.data);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  }, []);

  useEffect(() => {
    fetchKanban();
    fetchContacts();
  }, [fetchKanban, fetchContacts]);

  const handleCreateDeal = async (dealData: {
    title: string;
    details?: string;
    value?: number;
    currency?: string;
    stageId?: string;
    contactId?: string;
    expectedCloseDate?: string;
  }) => {
    try {
      await axios.post(`${API_URL}/deals`, dealData);
      setShowDealForm(false);
      fetchKanban();
    } catch (err) {
      console.error('Failed to create deal:', err);
    }
  };

  const handleUpdateDeal = async (dealId: string, dealUpdate: Partial<Deal>) => {
    try {
      await axios.put(`${API_URL}/deals/${dealId}`, dealUpdate);
      setEditingDeal(null);
      fetchKanban();
    } catch (err) {
      console.error('Failed to update deal:', err);
    }
  };

  const handleDeleteDeal = async (dealId: string) => {
    if (!window.confirm(t('deals.deleteConfirm'))) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/deals/${dealId}`);
      fetchKanban();
    } catch (err) {
      console.error('Failed to delete deal:', err);
    }
  };

  const handleMoveDeal = async (dealId: string, stageId: string) => {
    try {
      await axios.put(`${API_URL}/deals/${dealId}/move`, { stageId });
      fetchKanban();
    } catch (err) {
      console.error('Failed to move deal:', err);
    }
  };

  const handleDrop = (stageId: string) => {
    if (draggedDeal && draggedDeal.stageId !== stageId) {
      handleMoveDeal(draggedDeal.id, stageId);
    }
    setDraggedDeal(null);
  };

  const formatCurrency = (value: number, currency?: string | null) =>
    new Intl.NumberFormat(STRING_EN_US, {
      style: STRING_CURRENCY,
      currency: currency || STRING_USD,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  return (
    <div style={{ display: STRING_FLEX, height: '100vh', overflow: STRING_HIDDEN }}>
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isCollapsed}
        canToggleCollapse={canToggleCollapse}
        onToggleCollapse={toggleCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
      />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: theme.colors.background.default,
          padding: isNarrow ? `70px ${theme.spacing.sm} ${theme.spacing.md}` : theme.spacing.lg,
        }}
      >
        {isNarrow && (
          <button
            onClick={openMobileMenu}
            style={{
              position: STRING_FIXED,
              top: theme.spacing.md,
              left: theme.spacing.md,
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: theme.colors.background.paper,
              cursor: STRING_POINTER,
              display: STRING_FLEX,
              alignItems: STRING_CENTER,
              justifyContent: STRING_CENTER,
              fontSize: '1.5rem',
              boxShadow: theme.shadows.md,
              zIndex: 100,
            }}
            aria-label="Open navigation menu"
          >
            {EMOJI_MENU}
          </button>
        )}

        <div style={{ maxWidth: '100%', margin: STRING_AUTO }}>
          <DealsHeader
            t={t}
            onAddDeal={() => {
              setEditingDeal(null);
              setShowDealForm(true);
            }}
          />

          {loading && (
            <div style={{ textAlign: STRING_CENTER, padding: theme.spacing.xl, color: theme.colors.text.secondary }}>
              {t('deals.loading')}
            </div>
          )}

          {!loading && (!kanban || kanban.stages.length === 0) && <DealsEmptyState t={t} />}

          {!loading && kanban && kanban.stages.length > 0 && (
            <DealsKanbanBoard
              kanban={kanban}
              draggedDeal={draggedDeal}
              onDragStart={setDraggedDeal}
              onDragEnd={() => setDraggedDeal(null)}
              onDrop={handleDrop}
              onEditDeal={deal => {
                setEditingDeal(deal);
                setShowDealForm(true);
              }}
              onDeleteDeal={handleDeleteDeal}
              formatCurrency={formatCurrency}
            />
          )}
        </div>
      </div>

      {showDealForm && (
        <DealFormModal
          deal={editingDeal}
          stages={kanban?.stages || []}
          contacts={contacts}
          onSave={dealPayload => {
            if (editingDeal) {
              handleUpdateDeal(editingDeal.id, dealPayload);
            } else {
              handleCreateDeal(dealPayload);
            }
          }}
          onClose={() => {
            setShowDealForm(false);
            setEditingDeal(null);
          }}
        />
      )}
    </div>
  );
};

export default Deals;
