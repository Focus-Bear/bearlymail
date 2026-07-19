import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  COLOR_ERROR_MED,
  COLOR_GREY_BORDER,
  COLOR_GREY_LIGHT,
  COLOR_GREY_MID,
} from 'constants/colors';
import { CategoryFamily, useCategoryFamilies } from 'hooks/useCategoryFamilies';

const OTHER_OPTION_VALUE = '__other__';

interface FamilyCardProps {
  family: CategoryFamily;
  allFamilies: CategoryFamily[];
  onRename: (familyId: string, name: string) => Promise<void>;
  onReassign: (contextId: string, familyId: string | null) => Promise<void>;
}

/** One family with its categories. The family name is editable (unless it's the
 * synthetic "Other" group); each category has a dropdown to move it to another
 * family. */
const FamilyCard: React.FC<FamilyCardProps> = ({ family, allFamilies, onRename, onReassign }) => {
  const { t } = useTranslation();
  const [draftName, setDraftName] = useState(family.name);
  const isOther = family.id === null;

  return (
    <div
      data-testid={`category-family-${family.id ?? 'other'}`}
      style={{
        border: `1px solid ${COLOR_GREY_BORDER}`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {isOther ? (
          <strong>{t('settings.categoryFamilies.otherGroup')}</strong>
        ) : (
          <>
            <input
              aria-label={t('settings.categoryFamilies.familyNameLabel')}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              style={{ fontWeight: 600, flex: 1, padding: 4 }}
            />
            <button
              type="button"
              disabled={draftName.trim() === '' || draftName === family.name}
              onClick={() => {
                void onRename(family.id as string, draftName.trim());
              }}
            >
              {t('settings.categoryFamilies.rename')}
            </button>
          </>
        )}
        <span style={{ color: COLOR_GREY_LIGHT, fontSize: 12 }}>
          {t('settings.categoryFamilies.categoryCount', { count: family.categories.length })}
        </span>
      </div>

      {family.categories.map((category) => (
        <div
          key={category.contextId}
          style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}
        >
          <span style={{ flex: 1 }}>{category.name}</span>
          <select
            aria-label={t('settings.categoryFamilies.moveCategoryLabel')}
            value={family.id ?? OTHER_OPTION_VALUE}
            onChange={(event) => {
              void onReassign(
                category.contextId,
                event.target.value === OTHER_OPTION_VALUE ? null : event.target.value,
              );
            }}
          >
            {allFamilies
              .filter((option) => option.id !== null)
              .map((option) => (
                <option key={option.id} value={option.id as string}>
                  {option.name}
                </option>
              ))}
            <option value={OTHER_OPTION_VALUE}>
              {t('settings.categoryFamilies.otherGroup')}
            </option>
          </select>
        </div>
      ))}
    </div>
  );
};

/**
 * Settings section for managing category families — the coarse grouping above
 * the fine-grained categories. Users can rename families, move a category to a
 * different family, and create new families. Families are seeded automatically
 * the first time this loads.
 */
export const CategoryFamiliesSection: React.FC = () => {
  const { t } = useTranslation();
  const { families, isLoading, error, createFamily, renameFamily, reassignCategory } =
    useCategoryFamilies();
  const [newFamilyName, setNewFamilyName] = useState('');

  const handleCreate = async () => {
    await createFamily(newFamilyName.trim());
    setNewFamilyName('');
  };

  return (
    <section id="email-categories" aria-labelledby="category-families-heading" style={{ marginTop: 24 }}>
      <h3 id="category-families-heading">{t('settings.categoryFamilies.title')}</h3>
      <p style={{ color: COLOR_GREY_MID }}>{t('settings.categoryFamilies.description')}</p>

      {isLoading && <p>{t('settings.categoryFamilies.loading')}</p>}
      {error && <p style={{ color: COLOR_ERROR_MED }}>{t('settings.categoryFamilies.loadError')}</p>}

      {!isLoading &&
        !error &&
        families.map((family) => (
          <FamilyCard
            key={family.id ?? 'other'}
            family={family}
            allFamilies={families}
            onRename={renameFamily}
            onReassign={reassignCategory}
          />
        ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          aria-label={t('settings.categoryFamilies.newFamilyLabel')}
          placeholder={t('settings.categoryFamilies.newFamilyPlaceholder')}
          value={newFamilyName}
          onChange={(event) => setNewFamilyName(event.target.value)}
          style={{ flex: 1, padding: 4 }}
        />
        <button
          type="button"
          disabled={newFamilyName.trim() === ''}
          onClick={() => {
            void handleCreate();
          }}
        >
          {t('settings.categoryFamilies.create')}
        </button>
      </div>
    </section>
  );
};
