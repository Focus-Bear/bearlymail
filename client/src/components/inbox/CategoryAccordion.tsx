import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore } from 'types/email';

interface CategoryAccordionProps {
  category: string;
  emails: Email[];
  isExpanded: boolean;
  onToggle: () => void;
  onSelectAll: (emailIds: string[]) => void;
  selectedEmailIds: Set<string>;
  children: React.ReactNode;
}

const DEFAULT_CATEGORY_TRANSLATIONS: Record<string, string> = {
  'Newsletters': 'inbox.category.newsletters',
  'Sales': 'inbox.category.sales',
  'Partnerships': 'inbox.category.partnerships',
  'Customer Support': 'inbox.category.customerSupport',
  'HR Admin': 'inbox.category.hrAdmin',
  'Other': 'inbox.category.other',
};

const isDefaultCategory = (category: string): boolean => {
  return category in DEFAULT_CATEGORY_TRANSLATIONS;
};

const getCategoryTranslationKey = (category: string): string | null => {
  return DEFAULT_CATEGORY_TRANSLATIONS[category] || null;
};

const getCategoryIcon = (category: string): string => {
  const icons: Record<string, string> = {
    'Newsletters': '📰',
    'Sales': '💼',
    'Partnerships': '🤝',
    'Customer Support': '🎧',
    'HR Admin': '📋',
    'Other': '📧',
  };
  return icons[category] || '📧';
};

const EDIT_ICON = '✏️';

export const CategoryAccordion: React.FC<CategoryAccordionProps> = ({
  category,
  emails,
  isExpanded,
  onToggle,
  onSelectAll,
  selectedEmailIds,
  children,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [isPencilHovered, setIsPencilHovered] = useState(false);
  const emailCount = emails.length;
  const emailIds = emails.map(e => e.id);
  const allSelected = emailIds.length > 0 && emailIds.every(id => selectedEmailIds.has(id));

  const handleEditCategoryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate('/settings#email-categories');
  };

  const handleSelectAllClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectAll(emailIds);
  };

  const getSelectButtonText = (): string => {
    if (allSelected) {
      return t('inbox.category.deselectAll');
    }
    return t('inbox.category.selectAll');
  };

  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.paper,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          cursor: 'pointer',
          backgroundColor: isHovered ? theme.colors.interactive.hover : theme.colors.background.paper,
          transition: theme.transitions.fast,
          borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <span
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: theme.transitions.fast,
              fontSize: theme.typography.fontSize.lg,
              color: theme.colors.text.secondary,
            }}
          >
            ▶
          </span>
          <span style={{ fontSize: '1.25rem' }}>{getCategoryIcon(category)}</span>
          <span
            style={{
              fontWeight: theme.typography.fontWeight.semibold,
              fontSize: theme.typography.fontSize.base,
              color: theme.colors.text.primary,
            }}
          >
            {isDefaultCategory(category) ? t(getCategoryTranslationKey(category) as string) : category}
          </span>
          <span
            style={{
              backgroundColor: theme.colors.greyscale[300],
              color: theme.colors.text.secondary,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.full,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {emailCount}
          </span>
          <button
            onClick={handleEditCategoryClick}
            onMouseEnter={() => setIsPencilHovered(true)}
            onMouseLeave={() => setIsPencilHovered(false)}
            style={{
              padding: theme.spacing.xs,
              borderRadius: theme.borderRadius.sm,
              border: 'none',
              backgroundColor: isPencilHovered ? theme.colors.interactive.hover : 'transparent',
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              cursor: 'pointer',
              transition: theme.transitions.fast,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={t('inbox.category.editCategories')}
          >
            {EDIT_ICON}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <button
            onClick={handleSelectAllClick}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: allSelected ? theme.colors.primary.subtle : 'transparent',
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              cursor: 'pointer',
              transition: theme.transitions.fast,
            }}
            title={allSelected ? t('inbox.category.deselectAll') : t('inbox.category.selectAll')}
          >
            {getSelectButtonText()}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div
          style={{
            padding: theme.spacing.md,
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.md,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export interface CategoryGroup {
  category: string;
  emails: Email[];
  maxPriority: number;
}

export const groupEmailsByCategory = (emails: Email[]): CategoryGroup[] => {
  const categoryMap = new Map<string, Email[]>();

  emails.forEach(email => {
    const category = email.category || 'Other';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(email);
  });

  const groups: CategoryGroup[] = [];
  categoryMap.forEach((categoryEmails, category) => {
    const sortedEmails = [...categoryEmails].sort((a, b) => {
      const priorityA = getEmailPriorityScore(a);
      const priorityB = getEmailPriorityScore(b);
      return priorityB - priorityA;
    });

    const maxPriority = sortedEmails.length > 0 ? getEmailPriorityScore(sortedEmails[0]) : 0;

    groups.push({
      category,
      emails: sortedEmails,
      maxPriority,
    });
  });

  groups.sort((a, b) => b.maxPriority - a.maxPriority);

  return groups;
};
