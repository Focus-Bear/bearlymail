import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export const PROTO_CATEGORY_PROMOTION_THRESHOLD = 5;

export interface ProtoCategory {
  id: string;
  name: string;
  description: string | null;
  emailCount: number;
  createdAt: string;
}

/** Removes a single id key from draftNames immutably. */
const removeDraftName =
  (id: string) =>
  (prev: Record<string, string>): Record<string, string> => {
    const { [id]: _removed, ...rest } = prev;
    return rest;
  };

/**
 * Manages the mutable operations (promote / rename / delete) for proto categories.
 * Owns the in-flight status state for each operation.
 */
const useProtoCategoryMutations = (options: {
  setCategories: React.Dispatch<React.SetStateAction<ProtoCategory[]>>;
  setDraftNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  draftNames: Record<string, string>;
  showSuccess: (m: string) => void;
  showError: (m: string) => void;
  tFunc: (key: string) => string;
}) => {
  const { setCategories, setDraftNames, draftNames, showSuccess, showError, tFunc } = options;
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingNameId, setSavingNameId] = useState<string | null>(null);

  const handlePromote = useCallback(
    async (id: string) => {
      setPromotingId(id);
      try {
        await axios.post(`${API_URL}/proto-categories/${id}/promote`);
        setCategories(prev => prev.filter(cat => cat.id !== id));
        setDraftNames(removeDraftName(id));
        showSuccess(tFunc('settings.protoCategories.promotedSuccess'));
      } catch (error) {
        console.error('Failed to promote proto category:', error);
        showError(tFunc('settings.protoCategories.promoteError'));
      } finally {
        setPromotingId(null);
      }
    },
    [setCategories, setDraftNames, showError, showSuccess, tFunc]
  );

  const handleNameChange = useCallback(
    (id: string, value: string) => {
      setDraftNames(prev => ({ ...prev, [id]: value }));
    },
    [setDraftNames]
  );

  const handleSaveName = useCallback(
    async (id: string) => {
      const nextName = (draftNames[id] ?? '').trim();
      if (!nextName) {
        showError(tFunc('settings.protoCategories.nameRequired'));
        return;
      }
      setSavingNameId(id);
      try {
        const response = await axios.put<ProtoCategory>(`${API_URL}/proto-categories/${id}`, { name: nextName });
        setCategories(prev =>
          prev.map(category => (category.id === id ? { ...category, name: response.data.name } : category))
        );
        setDraftNames(prev => ({ ...prev, [id]: response.data.name }));
        showSuccess(tFunc('settings.protoCategories.renameSuccess'));
      } catch (error) {
        console.error('Failed to update proto category name:', error);
        showError(tFunc('settings.protoCategories.renameError'));
      } finally {
        setSavingNameId(null);
      }
    },
    [draftNames, setCategories, setDraftNames, showError, showSuccess, tFunc]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await axios.delete(`${API_URL}/proto-categories/${id}`);
        setCategories(prev => prev.filter(cat => cat.id !== id));
        setDraftNames(removeDraftName(id));
        showSuccess(tFunc('settings.protoCategories.deletedSuccess'));
      } catch (error) {
        console.error('Failed to delete proto category:', error);
        showError(tFunc('settings.protoCategories.deleteError'));
      } finally {
        setDeletingId(null);
      }
    },
    [setCategories, setDraftNames, showError, showSuccess, tFunc]
  );

  return { promotingId, deletingId, savingNameId, handlePromote, handleNameChange, handleSaveName, handleDelete };
};

/** Fetches and manages proto categories list, delegating mutations to useProtoCategoryMutations. */
export const useProtoCategories = (
  showSuccess: (m: string) => void,
  showError: (m: string) => void,
  tFunc: (tKey: string) => string
) => {
  const [categories, setCategories] = useState<ProtoCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get<ProtoCategory[]>(`${API_URL}/proto-categories`);
      setCategories(response.data);
      setDraftNames(Object.fromEntries(response.data.map(cat => [cat.id, cat.name])));
    } catch (error) {
      console.error('Failed to fetch proto categories:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const mutations = useProtoCategoryMutations({
    setCategories,
    setDraftNames,
    draftNames,
    showSuccess,
    showError,
    tFunc,
  });

  return { categories, isLoading, draftNames, fetchCategories, ...mutations };
};
