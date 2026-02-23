import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED } from 'constants/numbers';
import { API_URL } from 'config/api';

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
  onCategoryPromoted: () => void;
}

export const ProtoCategoriesModal: React.FC<ProtoCategoriesModalProps> = ({
  onClose,
  onCategoryPromoted,
}) => {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<ProtoCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get<ProtoCategory[]>(`${API_URL}/proto-categories`);
      setCategories(response.data);
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
      onCategoryPromoted();
    } catch (error) {
      console.error('Failed to promote proto category:', error);
    } finally {
      setPromotingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}/proto-categories/${id}`);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Failed to delete proto category:', error);
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
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
        zIndex: 2000,
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
              background: 'none',
              border: 'none',
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
          {isLoading ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              padding: theme.spacing.xl,
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
            }}>
              {t('common.loading')}
            </div>
          ) : categories.length === 0 ? (
            <div style={{
              padding: theme.spacing.lg,
              textAlign: 'center',
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
            }}>
              {t('settings.protoCategories.empty')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
              {categories.map((category) => {
                const isPromoting = promotingId === category.id;
                const isDeleting = deletingId === category.id;
                const isBusy = isPromoting || isDeleting;
                const progress = Math.min(category.emailCount, PROTO_CATEGORY_PROMOTION_THRESHOLD);

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
                        <div style={{
                          fontWeight: theme.typography.fontWeight.medium,
                          fontSize: theme.typography.fontSize.base,
                          color: theme.colors.text.primary,
                          marginBottom: theme.spacing.xs,
                        }}>
                          {category.name}
                        </div>
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
          )}
        </div>
      </div>
    </>
  );
};
