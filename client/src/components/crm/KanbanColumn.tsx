import React, { useState } from 'react';
import { theme } from 'theme/theme';
import { Deal, DealStage } from 'types/deal';

import { STRING_NONE } from 'constants/strings';

interface KanbanColumnProps {
  stage: DealStage;
  deals: Deal[];
  total: number;
  onDragStart: (deal: Deal) => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onEditDeal: (deal: Deal) => void;
  onDeleteDeal: (dealId: string) => void;
  formatCurrency: (value: number, currency?: string | null) => string;
  isDragOver: boolean;
}

interface KanbanColumnHeaderProps {
  stage: DealStage;
  dealCount: number;
  total: number;
  formatCurrency: (value: number, currency?: string | null) => string;
  stageColor: string;
}

const KanbanColumnHeader: React.FC<KanbanColumnHeaderProps> = ({
  stage,
  dealCount,
  total,
  formatCurrency,
  stageColor,
}) => (
  <div
    style={{
      padding: theme.spacing.md,
      borderBottom: `3px solid ${stageColor}`,
      borderRadius: `${theme.borderRadius.lg} ${theme.borderRadius.lg} 0 0`,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <span
          style={{
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.base,
          }}
        >
          {stage.name}
        </span>
        <span
          style={{
            backgroundColor: `${stageColor}20`,
            color: stageColor,
            padding: `1px ${theme.spacing.xs}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {dealCount}
        </span>
      </div>
      {total > 0 && (
        <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {formatCurrency(total)}
        </span>
      )}
    </div>
  </div>
);

interface KanbanCardProps {
  deal: Deal;
  onDragStart: (deal: Deal) => void;
  onDragEnd: () => void;
  onEditDeal: (deal: Deal) => void;
  onDeleteDeal: (dealId: string) => void;
  formatCurrency: (value: number, currency?: string | null) => string;
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  deal,
  onDragStart,
  onDragEnd,
  onEditDeal,
  onDeleteDeal,
  formatCurrency,
}) => (
  <div
    draggable
    onDragStart={() => onDragStart(deal)}
    onDragEnd={onDragEnd}
    onClick={() => onEditDeal(deal)}
    style={{
      padding: theme.spacing.md,
      backgroundColor: theme.colors.background.default,
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${theme.colors.border.light}`,
      cursor: 'grab',
      transition: theme.transitions.fast,
    }}
    onMouseEnter={event => {
      event.currentTarget.style.boxShadow = theme.shadows.md;
      event.currentTarget.style.borderColor = theme.colors.border.medium;
    }}
    onMouseLeave={event => {
      event.currentTarget.style.boxShadow = 'none';
      event.currentTarget.style.borderColor = theme.colors.border.light;
    }}
  >
    <div
      style={{
        fontWeight: theme.typography.fontWeight.medium,
        color: theme.colors.text.primary,
        fontSize: theme.typography.fontSize.sm,
        marginBottom: theme.spacing.xs,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {deal.title}
    </div>

    {deal.contactName && (
      <div
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.xs,
          marginBottom: theme.spacing.xs,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span>👤</span> {deal.contactName}
      </div>
    )}

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      {deal.value !== null ? (
        <span
          style={{
            color: theme.colors.primary.main,
            fontWeight: theme.typography.fontWeight.semibold,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {formatCurrency(deal.value, deal.currency)}
        </span>
      ) : (
        <span />
      )}

      {deal.expectedCloseDate && (
        <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
          {new Date(deal.expectedCloseDate).toLocaleDateString()}
        </span>
      )}
    </div>

    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: theme.spacing.xs }}>
      <button
        onClick={event => {
          event.stopPropagation();
          onDeleteDeal(deal.id);
        }}
        style={{
          background: STRING_NONE,
          border: STRING_NONE,
          color: theme.colors.text.tertiary,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xs,
          padding: '2px 4px',
        }}
        onMouseEnter={event => {
          event.currentTarget.style.color = theme.colors.accent.error;
        }}
        onMouseLeave={event => {
          event.currentTarget.style.color = theme.colors.text.tertiary;
        }}
      >
        {'✕'}
      </button>
    </div>
  </div>
);

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  stage,
  deals,
  total,
  onDragStart,
  onDragEnd,
  onDrop,
  onEditDeal,
  onDeleteDeal,
  formatCurrency,
  isDragOver,
}) => {
  const [isOver, setIsOver] = useState(false);

  const stageColor = stage.color || '#6B7280';

  return (
    <div
      onDragOver={event => {
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={event => {
        event.preventDefault();
        setIsOver(false);
        onDrop();
      }}
      style={{
        minWidth: '280px',
        maxWidth: '320px',
        flex: '0 0 280px',
        backgroundColor: isOver && isDragOver ? `${stageColor}10` : theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.sm,
        display: 'flex',
        flexDirection: 'column',
        border: isOver && isDragOver ? `2px dashed ${stageColor}` : '2px solid transparent',
        transition: 'border-color 0.2s, background-color 0.2s',
      }}
    >
      <KanbanColumnHeader
        stage={stage}
        dealCount={deals.length}
        total={total}
        formatCurrency={formatCurrency}
        stageColor={stageColor}
      />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: theme.spacing.sm,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.sm,
        }}
      >
        {deals.map(deal => (
          <KanbanCard
            key={deal.id}
            deal={deal}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onEditDeal={onEditDeal}
            onDeleteDeal={onDeleteDeal}
            formatCurrency={formatCurrency}
          />
        ))}
      </div>
    </div>
  );
};
