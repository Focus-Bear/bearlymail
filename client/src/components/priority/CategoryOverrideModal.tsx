import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { emailKeys } from 'queries/queryKeys';
import { useCategoryContextQuery } from 'queries/useCategoryContextQuery';
import { theme } from 'theme/theme';

import { ModalBackdrop, ModalContent, ModalFooter, ModalHeader } from 'components/modal';
import { API_URL } from 'config/api';
import { KEY_ARROW_DOWN, KEY_ARROW_UP, KEY_ENTER, KEY_ESCAPE } from 'constants/strings';
import { decrementCategorySummaryCount, removeEmail } from 'store/slices/emailSlice';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';

const CATEGORY_LISTBOX_ID = 'category-override-listbox';

interface CategoryOption {
  id: string | null;
  name: string;
}

interface CategorySelectProps {
  existingCategories: CategoryOption[];
  loadingCategories: boolean;
  isAddingNew: boolean;
  selectedCategoryId: string | null;
  customCategory: string;
  onSelectChange: (id: string | null, name: string) => void;
  onCustomChange: (v: string) => void;
  onAddNew: () => void;
  inputStyle: React.CSSProperties;
  t: (tKey: string) => string;
}

const CategorySelectField: React.FC<CategorySelectProps> = ({
  existingCategories,
  loadingCategories,
  isAddingNew,
  selectedCategoryId,
  customCategory,
  onSelectChange,
  onCustomChange,
  onAddNew,
  inputStyle,
  t,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const isSelectingRef = useRef(false);

  // Sync display when external selectedCategoryId changes
  const selectedOption = existingCategories.find(cat => cat.id === selectedCategoryId) ?? null;

  const filtered = existingCategories.filter(cat => cat.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Total items = filtered categories + "Add new category" sentinel
  const totalItems = filtered.length + 1;
  const ADD_NEW_INDEX = filtered.length;

  const getOptionId = (index: number) =>
    index === ADD_NEW_INDEX ? `${CATEGORY_LISTBOX_ID}-add-new` : `${CATEGORY_LISTBOX_ID}-option-${index}`;

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleFocus = () => {
    setIsOpen(true);
  };

  const handleBlur = () => {
    if (!isSelectingRef.current) {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === KEY_ARROW_DOWN || event.key === KEY_ARROW_UP) {
        setIsOpen(true);
        setHighlightedIndex(0);
        event.preventDefault();
      }
      return;
    }
    if (event.key === KEY_ARROW_DOWN) {
      event.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalItems);
    } else if (event.key === KEY_ARROW_UP) {
      event.preventDefault();
      setHighlightedIndex(prev => (prev <= 0 ? totalItems - 1 : prev - 1));
    } else if (event.key === KEY_ENTER) {
      event.preventDefault();
      if (highlightedIndex === ADD_NEW_INDEX) {
        handleAddNewMouseDown();
      } else if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        handleOptionMouseDown(filtered[highlightedIndex]);
      }
    } else if (event.key === KEY_ESCAPE) {
      event.preventDefault();
      setSearchTerm('');
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleOptionMouseDown = (cat: CategoryOption) => {
    isSelectingRef.current = true;
    setSearchTerm(cat.name);
    onSelectChange(cat.id, cat.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
    isSelectingRef.current = false;
  };

  const handleAddNewMouseDown = () => {
    isSelectingRef.current = true;
    setSearchTerm('');
    onAddNew();
    setIsOpen(false);
    setHighlightedIndex(-1);
    isSelectingRef.current = false;
  };

  const displayValue = isAddingNew ? '' : (selectedOption?.name ?? searchTerm);

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <label
        style={{
          display: 'block',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('priority.categoryOverride.newCategory')}:
      </label>

      {/* Combobox container */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={CATEGORY_LISTBOX_ID}
          aria-activedescendant={isOpen && highlightedIndex >= 0 ? getOptionId(highlightedIndex) : undefined}
          value={isAddingNew ? searchTerm : displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={loadingCategories}
          placeholder={
            loadingCategories
              ? t('priority.categoryOverride.loadingCategories')
              : t('priority.categoryOverride.filterPlaceholder')
          }
          autoComplete="off"
          style={{
            ...inputStyle,
            cursor: loadingCategories ? 'not-allowed' : 'text',
          }}
        />

        {isOpen && !loadingCategories && (
          <ul
            id={CATEGORY_LISTBOX_ID}
            role="listbox"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 10002,
              listStyle: 'none',
              margin: 0,
              padding: 0,
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              maxHeight: '200px',
              overflowY: 'auto',
            }}
          >
            {filtered.length === 0 && (
              <li
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  fontStyle: 'italic',
                }}
              >
                {t('priority.categoryOverride.noMatch')}
              </li>
            )}
            {filtered.map((cat, index) => (
              <CategoryOptionItem
                key={cat.id ?? cat.name}
                id={getOptionId(index)}
                cat={cat}
                isSelected={cat.id === selectedCategoryId}
                isHighlighted={highlightedIndex === index}
                onMouseDown={() => handleOptionMouseDown(cat)}
              />
            ))}
            {/* Always show "+ Add new category" at bottom */}
            <li
              id={getOptionId(ADD_NEW_INDEX)}
              role="option"
              aria-selected={isAddingNew}
              onMouseDown={handleAddNewMouseDown}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.primary.main,
                cursor: 'pointer',
                borderTop: filtered.length > 0 ? `1px solid ${theme.colors.border.light}` : undefined,
                fontWeight: theme.typography.fontWeight.medium,
                backgroundColor: highlightedIndex === ADD_NEW_INDEX ? theme.colors.background.subtle : 'transparent',
              }}
            >
              {t('priority.categoryOverride.addNewCategory')}
            </li>
          </ul>
        )}
      </div>

      {/* Custom category text input when adding new */}
      {isAddingNew && (
        <input
          type="text"
          autoFocus
          value={customCategory}
          onChange={event => onCustomChange(event.target.value)}
          placeholder={t('priority.categoryOverride.categoryPlaceholder')}
          style={{ ...inputStyle, marginTop: theme.spacing.sm }}
        />
      )}
    </div>
  );
};

interface CategoryOptionItemProps {
  id: string;
  cat: CategoryOption;
  isSelected: boolean;
  isHighlighted: boolean;
  onMouseDown: () => void;
}

const CategoryOptionItem: React.FC<CategoryOptionItemProps> = ({ id, cat, isSelected, isHighlighted, onMouseDown }) => {
  const [isHovered, setIsHovered] = useState(false);

  let backgroundColor = 'transparent';
  if (isHighlighted || isHovered) {
    backgroundColor = theme.colors.background.subtle;
  } else if (isSelected) {
    backgroundColor = theme.colors.primary.subtle;
  }

  return (
    <li
      id={id}
      role="option"
      aria-selected={isSelected}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
        color: isSelected ? theme.colors.primary.main : theme.colors.text.primary,
        backgroundColor,
      }}
    >
      {cat.name}
    </li>
  );
};

interface CategoryOverrideModalProps {
  emailId: string;
  currentCategory: string;
  /** UUID of the email's current category — used for optimistic Redux updates. */
  currentCategoryId?: string | null;
  onClose: () => void;
  onSubmitted?: (newCategory: string) => void;
}

export const CategoryOverrideModal: React.FC<CategoryOverrideModalProps> = ({
  emailId,
  currentCategory,
  currentCategoryId,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  // selectedCategoryId stores the UUID of the chosen category (null for "Other"/uncategorized)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  // selectedCategoryName tracks the display name for the UI and audit log
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch ALL user-defined categories from GET /context (EMAIL_CATEGORY entries).
  // This returns every category the user has defined, including empty ones —
  // unlike useInboxSummaryQuery which only returns categories with emails in inbox.
  const { data: contextCategories, isLoading: loadingCategories, isError: categoriesError } = useCategoryContextQuery();

  // Derive the category options from the query data, excluding the current category
  const existingCategories: CategoryOption[] = (contextCategories ?? [])
    .filter(cat => cat.name !== currentCategory)
    .map(cat => ({ id: cat.id ?? null, name: cat.name }));

  const handleSelectChange = (id: string | null, name: string) => {
    setIsAddingNew(false);
    setSelectedCategoryId(id);
    setSelectedCategoryName(name);
    setCustomCategory('');
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setSelectedCategoryId(null);
    setSelectedCategoryName('');
    setCustomCategory('');
  };

  // Resolved values for submission
  const resolvedCategoryName = isAddingNew ? customCategory.trim() : selectedCategoryName;
  const resolvedCategoryId = isAddingNew ? null : selectedCategoryId;
  const canSubmit = !!resolvedCategoryName;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/emails/${emailId}/category-override`, {
        // Send categoryId (UUID) when available — backend uses this directly without name→UUID lookup
        // Falls back to categoryName for new custom categories that don't have a UUID yet
        categoryId: resolvedCategoryId ?? undefined,
        categoryName: resolvedCategoryName,
        // Keep category field for backward compat with older server versions
        category: resolvedCategoryName,
        reason: reasonText.trim() || undefined,
      });

      // Optimistic UI update: remove the email from its current category accordion
      // so the user sees immediate feedback without a full page reload.
      const oldCategoryKey = currentCategoryId ?? CATEGORY_KEY_UNCATEGORIZED;
      dispatch(removeEmail(emailId));
      dispatch(decrementCategorySummaryCount({ categoryKey: oldCategoryKey, count: 1 }));

      // Invalidate the inbox summary cache so category counts and email lists
      // are refetched from the server (the email will appear in the new category).
      void queryClient.invalidateQueries({ queryKey: emailKeys.all });

      if (onSubmitted) {
        onSubmitted(resolvedCategoryName);
      }
      onClose();
    } catch (error) {
      console.error('Error submitting category override:', error);
      alert(t('priority.categoryOverride.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: theme.spacing.sm,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSize.sm,
    fontFamily: theme.typography.fontFamily,
    boxSizing: 'border-box',
    backgroundColor: theme.colors.background.paper,
    color: theme.colors.text.primary,
  };

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10001}>
      <ModalContent>
        <ModalHeader title={t('priority.categoryOverride.title')} />

        <p
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.md,
            lineHeight: theme.typography.lineHeight.relaxed,
          }}
        >
          {t('priority.categoryOverride.description', { category: currentCategory })}
        </p>

        {categoriesError && (
          <p
            role="alert"
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.feedback.error,
              marginBottom: theme.spacing.md,
            }}
          >
            {t('priority.categoryOverride.loadError')}
          </p>
        )}

        <CategorySelectField
          existingCategories={existingCategories}
          loadingCategories={loadingCategories}
          isAddingNew={isAddingNew}
          selectedCategoryId={selectedCategoryId}
          customCategory={customCategory}
          onSelectChange={handleSelectChange}
          onCustomChange={setCustomCategory}
          onAddNew={handleAddNew}
          inputStyle={inputStyle}
          t={t}
        />
        <div style={{ marginBottom: theme.spacing.md }}>
          <label
            style={{
              display: 'block',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.xs,
            }}
          >
            {t('priority.categoryOverride.reason')}:
          </label>
          <textarea
            value={reasonText}
            onChange={event => setReasonText(event.target.value)}
            placeholder={t('priority.categoryOverride.reasonPlaceholder')}
            style={{
              width: '100%',
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              fontFamily: theme.typography.fontFamily,
              resize: 'vertical',
              minHeight: '80px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <ModalFooter onCancel={onClose} onSubmit={handleSubmit} isSubmitting={submitting} canSubmit={canSubmit} />
      </ModalContent>
    </ModalBackdrop>,
    document.body
  );
};
