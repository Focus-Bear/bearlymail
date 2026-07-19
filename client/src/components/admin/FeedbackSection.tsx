import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { FeedbackItem } from 'types/feedback';
import { getMfaErrorType } from 'utils/mfaErrors';

import { API_URL } from 'config/api';

import { useAdminMfa } from './AdminMfaGate';
import { FeedbackCard } from './FeedbackCard';

interface FeedbackResponse {
  items: FeedbackItem[];
  total: number;
}

const PAGE_SIZE = 50;

export const FeedbackSection: React.FC = () => {
  const { t } = useTranslation();
  const { onMfaRequired, mfaVerifiedAt } = useAdminMfa();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get<FeedbackResponse>(`${API_URL}/feedback/admin`, {
          params: { page: pageNum, limit: PAGE_SIZE },
        });
        setItems(response.data.items);
        setTotal(response.data.total);
      } catch (err) {
        const mfaType = getMfaErrorType(err);
        if (mfaType) {
 onMfaRequired(mfaType); return; 
}
        setError(t('contactFeedback.adminError'));
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [t, onMfaRequired]
  );

  useEffect(() => {
    void load(page);
  }, [load, page, mfaVerifiedAt]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}/feedback/admin/${id}`);
      setItems(prev => prev.filter(item => item.id !== id));
      setTotal(prev => prev - 1);
    } catch (err) {
      console.error('Failed to delete feedback:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <section>
      <h2>
        {t('contactFeedback.adminTitle')} ({total})
      </h2>

      {loading && <p>{t('contactFeedback.adminLoading')}</p>}

      {error && <p>{error}</p>}

      {!loading && !error && items.length === 0 && <p>{t('contactFeedback.adminEmpty')}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        {items.map(item => (
          <FeedbackCard key={item.id} item={item} deletingId={deletingId} onDelete={handleDelete} t={t} />
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.md, alignItems: 'center' }}>
          <button onClick={() => setPage(prevPage => Math.max(0, prevPage - 1))} disabled={page === 0 || loading}>
            {t('contactFeedback.adminPrev')}
          </button>
          <span>{t('contactFeedback.adminPageOf', { page: page + 1, total: totalPages })}</span>
          <button
            onClick={() => setPage(prevPage => Math.min(totalPages - 1, prevPage + 1))}
            disabled={page >= totalPages - 1 || loading}
          >
            {t('contactFeedback.adminNext')}
          </button>
        </div>
      )}
    </section>
  );
};
