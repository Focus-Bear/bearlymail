import { useCallback, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { CONTEXT_KEY_WORKING_ON, CONTEXT_SOURCE_USER_EDITED } from 'constants/strings';

export interface UserContext {
  contextId: string;
  contextKey: string;
  contextValue: string;
  source: string;
  priority?: number;
  explanation?: string;
}

export const useContextManagement = () => {
  const [contexts, setContexts] = useState<UserContext[]>([]);
  const [newContextValue, setNewContextValue] = useState('');
  const [newContextPriority, setNewContextPriority] = useState<number>(2);
  const [addingContextType, setAddingContextType] = useState<string | null>(null);
  const [editingContextId, setEditingContextId] = useState<string | null>(null);
  const [editContextValue, setEditContextValue] = useState('');
  const [editContextPriority, setEditContextPriority] = useState<number>(2);

  const fetchContexts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/context`);
      setContexts(response.data);
    } catch (error) {
      console.error('Error fetching contexts:', error);
      setContexts([]);
    }
  }, []);

  const addContext = useCallback(async () => {
    if (!newContextValue.trim() || !addingContextType) {
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const newContext: UserContext = {
      contextId: tempId,
      contextKey: addingContextType,
      contextValue: newContextValue.trim(),
      source: CONTEXT_SOURCE_USER_EDITED,
      priority: addingContextType === CONTEXT_KEY_WORKING_ON ? newContextPriority : undefined,
    };
    setContexts(prev => [...prev, newContext]);
    setNewContextValue('');
    setNewContextPriority(2);
    setAddingContextType(null);

    try {
      const response = await axios.post(`${API_URL}/context`, {
        contextKey: addingContextType,
        contextValue: newContextValue.trim(),
        priority: addingContextType === CONTEXT_KEY_WORKING_ON ? newContextPriority : undefined,
      });
      setContexts(prev =>
        prev.map(ctx => (ctx.contextId === tempId ? { ...ctx, contextId: response.data.contextId } : ctx))
      );
    } catch (error) {
      console.error('Error adding context:', error);
      setContexts(prev => prev.filter(ctx => ctx.contextId !== tempId));
    }
  }, [newContextValue, addingContextType, newContextPriority]);

  const updateContext = useCallback(async () => {
    if (!editContextValue.trim() || !editingContextId) {
      return;
    }

    const contextToUpdate = contexts.find(ctx => ctx.contextId === editingContextId);

    setContexts(prev =>
      prev.map(ctx =>
        ctx.contextId === editingContextId
          ? { ...ctx, contextValue: editContextValue.trim(), priority: editContextPriority }
          : ctx
      )
    );
    setEditingContextId(null);
    const savedValue = editContextValue;
    const savedPriority = editContextPriority;
    setEditContextValue('');
    setEditContextPriority(2);

    try {
      await axios.put(`${API_URL}/context/${editingContextId}`, {
        value: savedValue.trim(),
        priority: contextToUpdate?.contextKey === CONTEXT_KEY_WORKING_ON ? savedPriority : undefined,
      });
    } catch (error) {
      console.error('Error updating context:', error);
      if (contextToUpdate) {
        setContexts(prev => prev.map(ctx => (ctx.contextId === editingContextId ? contextToUpdate : ctx)));
      }
    }
  }, [editContextValue, editingContextId, editContextPriority, contexts]);

  const deleteContext = useCallback(
    async (contextId: string) => {
      const deletedContext = contexts.find(ctx => ctx.contextId === contextId);
      setContexts(prev => prev.filter(ctx => ctx.contextId !== contextId));

      try {
        await axios.delete(`${API_URL}/context/${contextId}`);
      } catch (error) {
        console.error('Error deleting context:', error);
        if (deletedContext) {
          setContexts(prev => [...prev, deletedContext]);
        }
      }
    },
    [contexts]
  );

  return {
    contexts,
    newContextValue,
    newContextPriority,
    addingContextType,
    editingContextId,
    editContextValue,
    editContextPriority,
    setContexts,
    setNewContextValue,
    setNewContextPriority,
    setAddingContextType,
    setEditingContextId,
    setEditContextValue,
    setEditContextPriority,
    fetchContexts,
    addContext,
    updateContext,
    deleteContext,
  };
};
