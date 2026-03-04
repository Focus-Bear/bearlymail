import React, { useCallback,useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ContactTypeConfig } from 'types/contact';

import { API_URL } from 'config/api';

import { ContactTypeBadge } from './ContactTypeBadge';

let configsCache: ContactTypeConfig[] | null = null;
const typeCache = new Map<string, string | null>();
const pendingEmails = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Map<string, Set<(type: string | null) => void>>();

const BATCH_DELAY_MS = 100;

function loadConfigs(): Promise<ContactTypeConfig[]> {
  if (configsCache) return Promise.resolve(configsCache);
  return axios.get(`${API_URL}/contacts/types`).then(res => {
    configsCache = res.data;
    return res.data;
  });
}

function scheduleBatch() {
  if (batchTimer) return;
  batchTimer = setTimeout(async () => {
    batchTimer = null;
    const emails = [...pendingEmails];
    pendingEmails.clear();
    if (emails.length === 0) return;

    try {
      const response = await axios.get(`${API_URL}/contacts/contact-types-by-emails`, {
        params: { emails: emails.join(',') },
      });
      const contactTypeMap: Record<string, string> = response.data;

      for (const email of emails) {
        const typeName = contactTypeMap[email] || null;
        typeCache.set(email, typeName);
        const callbacks = listeners.get(email);
        if (callbacks) callbacks.forEach(callback => callback(typeName));
      }
    } catch {
      for (const email of emails) {
        typeCache.set(email, null);
        const callbacks = listeners.get(email);
        if (callbacks) callbacks.forEach(callback => callback(null));
      }
    }
  }, BATCH_DELAY_MS);
}

interface InboxContactTypeBadgeProps {
  senderEmail: string | null | undefined;
}

export const InboxContactTypeBadge: React.FC<InboxContactTypeBadgeProps> = ({ senderEmail }) => {
  const [config, setConfig] = useState<ContactTypeConfig | null>(null);
  const mountedRef = useRef(true);

  const resolveConfig = useCallback(async (typeName: string | null) => {
    if (!typeName || !mountedRef.current) {
      setConfig(null);
      return;
    }
    const configs = await loadConfigs();
    if (mountedRef.current) {
      setConfig(configs.find(c => c.name === typeName) || null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!senderEmail) return;
    const email = senderEmail.toLowerCase();

    if (typeCache.has(email)) {
      resolveConfig(typeCache.get(email) ?? null);
      return;
    }

    const callback = (type: string | null) => resolveConfig(type);

    if (!listeners.has(email)) {
      listeners.set(email, new Set());
    }
    listeners.get(email)!.add(callback);

    pendingEmails.add(email);
    scheduleBatch();

    return () => {
      listeners.get(email)?.delete(callback);
    };
  }, [senderEmail, resolveConfig]);

  if (!config) return null;

  return <ContactTypeBadge label={config.label} color={config.color} icon={config.icon} />;
};
