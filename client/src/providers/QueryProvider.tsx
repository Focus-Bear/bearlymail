/**
 * TanStack Query provider — wraps the app with a shared QueryClient.
 *
 * Defaults:
 *  - staleTime  60s  (matches the old INBOX_CACHE_TTL_MS)
 *  - gcTime     5 min (garbage-collect inactive queries after 5 min)
 *  - retry      2 attempts on failure
 *  - refetchOnWindowFocus  false  (BearlyMail handles its own refresh logic)
 *
 * DevTools are included but only rendered in development builds.
 *
 * Introduced in: plan #1225 / PR #1236
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { GC_TIME_DEFAULT, STALE_TIME_1_MIN } from 'queries/constants';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_1_MIN,
      gcTime: GC_TIME_DEFAULT,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    {children}
    {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>
);
