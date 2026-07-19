import { useCallback, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface BatchSchedule {
  deliveryDays: number[];
  deliveryTimes: string[];
  timezone: string;
  isEnabled: boolean;
  urgentBypassSchedule: boolean;
}

function defaultBatchSchedule(): BatchSchedule {
  return {
    deliveryDays: [1, 2, 3, 4, 5],
    deliveryTimes: ['11:00', '15:00'],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isEnabled: true,
    urgentBypassSchedule: true,
  };
}

export const useBatchSchedule = () => {
  const [batchSchedule, setBatchSchedule] = useState<BatchSchedule>(defaultBatchSchedule);
  const [savedBatchSchedule, setSavedBatchSchedule] = useState<BatchSchedule | null>(null);
  const [newDeliveryTime, setNewDeliveryTime] = useState('');

  const isBatchScheduleDirty =
    savedBatchSchedule !== null && JSON.stringify(batchSchedule) !== JSON.stringify(savedBatchSchedule);

  const fetchBatchSchedule = useCallback(async () => {
    let schedule = defaultBatchSchedule();
    try {
      const response = await axios.get(`${API_URL}/batch-schedule`);
      if (response.data) {
        schedule = {
          // Normalize to numbers: simple-array TypeORM columns return strings from DB
          deliveryDays: ([...new Set((response.data.deliveryDays || [1, 2, 3, 4, 5]).map(Number))] as number[]).sort(
            (itemA, itemB) => (itemA as number) - (itemB as number)
          ),
          deliveryTimes: response.data.deliveryTimes || ['11:00', '15:00'],
          timezone: response.data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          isEnabled: response.data.isEnabled ?? true,
          urgentBypassSchedule: response.data.urgentBypassSchedule ?? true,
        };
      }
    } catch (error) {
      console.error('Error fetching batch schedule:', error);
    }
    setBatchSchedule(schedule);
    setSavedBatchSchedule(schedule);
  }, []);

  const updateBatchSchedule = useCallback(async (schedule: BatchSchedule): Promise<boolean> => {
    try {
      await axios.put(`${API_URL}/batch-schedule`, schedule);
      setBatchSchedule(schedule);
      setSavedBatchSchedule(schedule);
      return true;
    } catch (error) {
      console.error('Error updating batch schedule:', error);
      return false;
    }
  }, []);

  const addDeliveryTime = useCallback(
    (time: string) => {
      if (!time.trim()) {
        return;
      }
      const newTimes = [...batchSchedule.deliveryTimes, time.trim()];
      updateBatchSchedule({ ...batchSchedule, deliveryTimes: newTimes });
      setNewDeliveryTime('');
    },
    [batchSchedule, updateBatchSchedule]
  );

  const removeDeliveryTime = useCallback(
    (index: number) => {
      const newTimes = [...batchSchedule.deliveryTimes];
      newTimes.splice(index, 1);
      updateBatchSchedule({ ...batchSchedule, deliveryTimes: newTimes });
    },
    [batchSchedule, updateBatchSchedule]
  );

  return {
    batchSchedule,
    newDeliveryTime,
    isBatchScheduleDirty,
    setBatchSchedule,
    setNewDeliveryTime,
    fetchBatchSchedule,
    updateBatchSchedule,
    addDeliveryTime,
    removeDeliveryTime,
  };
};
