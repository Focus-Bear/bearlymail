import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { CONTEXT_KEY_WORKING_ON, CONTEXT_SOURCE_USER_EDITED } from 'constants/strings';

import { isLearnedContextItemList, type LearnedContextItem } from './learned-context';

const CONTEXT_PATH = '/context';
const TEMP_ID_PREFIX = 'temp-';
/** Matches the Settings default: medium priority for a project the user adds by hand. */
const DEFAULT_PROJECT_PRIORITY = 2;

export const LOAD_STATUS_IDLE = 'idle';
export const LOAD_STATUS_LOADING = 'loading';
export const LOAD_STATUS_READY = 'ready';
export const LOAD_STATUS_ERROR = 'error';
export type LoadStatus =
  | typeof LOAD_STATUS_IDLE
  | typeof LOAD_STATUS_LOADING
  | typeof LOAD_STATUS_READY
  | typeof LOAD_STATUS_ERROR;

interface CreatedContext {
  contextId: string;
}

interface UseLearnedContextResult {
  items: LearnedContextItem[];
  loadStatus: LoadStatus;
  hasSaveError: boolean;
  addItem: (contextKey: string, contextValue: string) => Promise<void>;
  updateItem: (contextId: string, contextValue: string) => Promise<void>;
  removeItem: (contextId: string) => Promise<void>;
}

/** True while an added item is still waiting for the server to assign its real id. */
export function isPendingContextId(contextId: string): boolean {
  return contextId.startsWith(TEMP_ID_PREFIX);
}

function buildTempId(): string {
  return `${TEMP_ID_PREFIX}${Date.now()}`;
}

function buildCreatePayload(contextKey: string, contextValue: string) {
  return {
    contextKey,
    contextValue,
    source: CONTEXT_SOURCE_USER_EDITED,
    priority: contextKey === CONTEXT_KEY_WORKING_ON ? DEFAULT_PROJECT_PRIORITY : undefined,
  };
}

/**
 * Loads what the onboarding analysis learned (GET /context) once `isEnabled`
 * turns true, and lets the user add, rename and remove items. Writes are
 * optimistic and roll back on failure; PUT marks the row USER_EDITED server-side.
 */
export function useLearnedContext(isEnabled: boolean): UseLearnedContextResult {
  const [items, setItems] = useState<LearnedContextItem[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(LOAD_STATUS_IDLE);
  const [hasSaveError, setHasSaveError] = useState(false);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!isEnabled || hasFetchedRef.current) {
      return;
    }
    hasFetchedRef.current = true;
    setLoadStatus(LOAD_STATUS_LOADING);
    axios
      .get<unknown>(`${API_URL}${CONTEXT_PATH}`)
      .then(response => {
        setItems(isLearnedContextItemList(response.data) ? response.data : []);
        setLoadStatus(LOAD_STATUS_READY);
      })
      .catch(error => {
        console.error('Failed to load learned context:', error);
        setLoadStatus(LOAD_STATUS_ERROR);
      });
  }, [isEnabled]);

  const addItem = useCallback(async (contextKey: string, contextValue: string) => {
    const tempId = buildTempId();
    setHasSaveError(false);
    setItems(prev => [
      ...prev,
      { contextId: tempId, clientKey: tempId, contextKey, contextValue, source: CONTEXT_SOURCE_USER_EDITED },
    ]);
    try {
      const response = await axios.post<CreatedContext>(
        `${API_URL}${CONTEXT_PATH}`,
        buildCreatePayload(contextKey, contextValue)
      );
      setItems(prev =>
        prev.map(item => (item.contextId === tempId ? { ...item, contextId: response.data.contextId } : item))
      );
    } catch (error) {
      console.error('Failed to add learned context:', error);
      setItems(prev => prev.filter(item => item.contextId !== tempId));
      setHasSaveError(true);
    }
  }, []);

  const updateItem = useCallback(
    async (contextId: string, contextValue: string) => {
      const previous = items.find(item => item.contextId === contextId);
      if (!previous || previous.contextValue === contextValue) {
        return;
      }
      setHasSaveError(false);
      setItems(prev =>
        prev.map(item =>
          item.contextId === contextId ? { ...item, contextValue, source: CONTEXT_SOURCE_USER_EDITED } : item
        )
      );
      try {
        await axios.put(`${API_URL}${CONTEXT_PATH}/${contextId}`, { value: contextValue });
      } catch (error) {
        console.error('Failed to update learned context:', error);
        setItems(prev => prev.map(item => (item.contextId === contextId ? previous : item)));
        setHasSaveError(true);
      }
    },
    [items]
  );

  const removeItem = useCallback(
    async (contextId: string) => {
      const removedIndex = items.findIndex(item => item.contextId === contextId);
      if (removedIndex === -1) {
        return;
      }
      const removed = items[removedIndex];
      setHasSaveError(false);
      setItems(prev => prev.filter(item => item.contextId !== contextId));
      try {
        await axios.delete(`${API_URL}${CONTEXT_PATH}/${contextId}`);
      } catch (error) {
        console.error('Failed to remove learned context:', error);
        setItems(prev => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
        setHasSaveError(true);
      }
    },
    [items]
  );

  return { items, loadStatus, hasSaveError, addItem, updateItem, removeItem };
}
