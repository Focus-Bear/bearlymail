import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED, Z_INDEX_POPUP } from 'constants/numbers';
import { API_URL } from 'config/api';
import { useNotifications } from 'contexts/NotificationContext';
import { STRING_NONE } from 'constants/strings';

const PROTO_CATEGORY_PROMOTION_THRESHOLD = 5;

interface ProtoCategory {
  id: string;
  name: string;
  description: string | null;
  emailCount: number;
  createdAt: string;
}

interface ProtoCategoriesModalProps {
  onClose: () => void;
}

export const ProtoCategoriesModal: React.FC<ProtoCategoriesModalProps> = ({
  onClose,
}) => {
  const { t } = useTranslation();
  const { showError, showSuccess } = useNotifications();
  const [categories, setCategories] = useState<ProtoCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingNameId, setSavingNameId] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get<ProtoCategory[]>(`${API_URL}/proto-categories`);
      setCategories(response.data);
      setDraftNames(Object.fromEntries(response.data.map((category) => [category.id, category.name])));
    } catch (error) {
      console.error('Failed to fetch proto categories:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handlePromote = async (id: string) => {
    setPromotingId(id);
    try {
      await axios.post(`${API_URL}/proto-categories/${id}/promote`);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setDraftNames((prev) => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
      showSuccess(t('settings.protoCategories.promotedSuccess'));
    } catch (error) {
      console.error('Failed to promote proto category:', error);
      showError(t('settings.protoCategories.promoteError'));
    } finally {
      setPromotingId(null);
    }
  };


  const handleNameChange = (id: string, value: string) => {
    setDraftNames((prev) => ({ ...prev, [id]: value }));
  };

  const handleSaveName = async (id: string) => {
    const nextName = (draftNames[id] ?? '').trim();
    if (!nextName) {
      showError(t('settings.protoCategories.nameRequired'));
      return;
    }

    setSavingNameId(id);
    try {
      const response = await axios.put<ProtoCategory>(`${API_URL}/proto-categories/${id}`, {
        name: nextName,
      });
      setCategories((prev) =>
        prev.map((category) =>
          category.id === id ? { ...category, name: response.data.name } : category,
        ),
      );
      setDraftNames((prev) => ({ ...prev, [id]: response.data.name }));
      showSuccess(t('settings.protoCategories.renameSuccess'));
    } catch (error) {
      console.error('Failed to update proto category name:', error);
      showError(t('settings.protoCategories.renameError'));
    } finally {
      setSavingNameId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}/proto-categories/${id}`);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setDraftNames((prev) => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
      showSuccess(t('settings.protoCategories.deletedSuccess'));
    } catch (error) {
      console.error('Failed to delete proto category:', error);
      showError(t('settings.protoCategories.deleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.colors.overlay.darkLight,
          zIndex: 1999,
        }}
      />
      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.xl,
        width: '90%',
        maxWidth: '600px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        zIndex: Z_INDEX_POPUP,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: theme.spacing.md,
        }}>
          <div>
            <h3 style={{
              margin: 0,
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
            }}>
              {t('settings.protoCategories.title')}
            </h3>
            <p style={{
              margin: `${theme.spacing.xs} 0 0 0`,
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
            }}>
              {t('settings.protoCategories.description')}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: STRING_NONE,
              border: STRING_NONE,
              fontSize: '20px',
              color: theme.colors.text.secondary,
              cursor: 'pointer',
              padding: '0',
              marginLeft: theme.spacing.md,
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          overflowY: 'auto',
          flex: 1,
        }}>
          {(() => {
            if (isLoading) return (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                padding: theme.spacing.xl,
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.sm,
              }}>
                {t('common.loading')}
              </div>
            );
            if (categories.length === 0) return (
              <div style={{
                padding: theme.spacing.lg,
                textAlign: 'center',
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.sm,
              }}>
                {t('settings.protoCategories.empty')}
              </div>
            );
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
              {categories.map((category) => {
                const isPromoting = promotingId === category.id;
                const isDeleting = deletingId === category.id;
                const isSavingName = savingNameId === category.id;
                const isBusy = isPromoting || isDeleting;
                const progress = Math.min(category.emailCount, PROTO_CATEGORY_PROMOTION_THRESHOLD);
                const draftName = draftNames[category.id] ?? category.name;
                const hasNameChanged = draftName.trim() !== category.name;

                return (
                  <div
                    key={category.id}
                    style={{
                      border: `1px solid ${theme.colors.border.light}`,
                      borderRadius: theme.borderRadius.md,
                      padding: theme.spacing.md,
                      backgroundColor: theme.colors.background.subtle,
                      opacity: isBusy ? OPACITY_DISABLED : 1,
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: theme.spacing.sm,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          type="text"
                          value={draftName}
                          onChange={(event) => handleNameChange(category.id, event.target.value)}
                          disabled={isSavingName}
                          style={{
                            width: '100%',
                            fontWeight: theme.typography.fontWeight.medium,
                            fontSize: theme.typography.fontSize.base,
                            color: theme.colors.text.primary,
                            marginBottom: theme.spacing.xs,
                            border: `1px solid ${theme.colors.border.medium}`,
                            borderRadius: theme.borderRadius.sm,
                            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                            backgroundColor: theme.colors.background.paper,
                          }}
                          aria-label={t('settings.protoCategories.nameLabel')}
                        />
                        {category.description && (
                          <div style={{
                            fontSize: theme.typography.fontSize.sm,
                            color: theme.colors.text.secondary,
                            marginBottom: theme.spacing.xs,
                          }}>
                            {category.description}
                          </div>
                        )}
                        {/* Progress bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                          <div style={{
                            flex: 1,
                            height: '4px',
                            backgroundColor: theme.colors.border.light,
                            borderRadius: theme.borderRadius.full,
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${(progress / PROTO_CATEGORY_PROMOTION_THRESHOLD) * 100}%`,
                              height: '100%',
                              backgroundColor: theme.colors.primary.main,
                            }} />
                          </div>
                          <span style={{
                            fontSize: theme.typography.fontSize.xs,
                            color: theme.colors.text.secondary,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}>
                            {t('settings.protoCategories.progress', {
                              count: category.emailCount,
                              threshold: PROTO_CATEGORY_PROMOTION_THRESHOLD,
                            })}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: theme.spacing.sm, flexShrink: 0 }}>
                        <button
                          onClick={() => handleSaveName(category.id)}
                          disabled={isSavingName || !hasNameChanged || isBusy}
                          style={{
                            background: 'transparent',
                            border: `1px solid ${theme.colors.border.medium}`,
                            color: theme.colors.text.primary,
                            cursor: isSavingName || !hasNameChanged || isBusy ? 'not-allowed' : 'pointer',
                            fontSize: theme.typography.fontSize.sm,
                            fontWeight: theme.typography.fontWeight.medium,
                            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                            borderRadius: theme.borderRadius.sm,
                            opacity: isSavingName || !hasNameChanged || isBusy ? OPACITY_DISABLED : 1,
                          }}
                        >
                          {isSavingName
                            ? t('settings.protoCategories.savingName')
                            : t('settings.protoCategories.saveName')}
                        </button>
                        <button
                          onClick={() => handlePromote(category.id)}
                          disabled={isBusy}
                          style={{
                            background: 'transparent',
                            border: `1px solid ${theme.colors.primary.main}`,
                            color: theme.colors.primary.main,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            fontSize: theme.typography.fontSize.sm,
                            fontWeight: theme.typography.fontWeight.medium,
                            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                            borderRadius: theme.borderRadius.sm,
                            opacity: isBusy ? OPACITY_DISABLED : 1,
                          }}
                        >
                          {isPromoting
                            ? t('settings.protoCategories.promoting')
                            : t('settings.protoCategories.promote')}
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          disabled={isBusy}
                          style={{
                            background: 'transparent',
                            border: `1px solid ${theme.colors.accent.error}`,
                            color: theme.colors.accent.error,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            fontSize: theme.typography.fontSize.sm,
                            fontWeight: theme.typography.fontWeight.medium,
                            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                            borderRadius: theme.borderRadius.sm,
                            opacity: isBusy ? OPACITY_DISABLED : 1,
                          }}
                        >
                          {isDeleting
                            ? t('settings.protoCategories.deleting')
                            : t('settings.protoCategories.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}
        </div>
      </div>
    </>
  );
};
