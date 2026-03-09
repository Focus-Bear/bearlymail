import { useCallback, useEffect, useRef } from 'react';

interface UseInboxScrollObserverParams {
  hasMore: boolean;
  onLoadMore?: () => Promise<void>;
}

interface UseInboxScrollObserverResult {
  sentinelRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function useInboxScrollObserver({
  hasMore,
  onLoadMore,
}: UseInboxScrollObserverParams): UseInboxScrollObserverResult {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);

  const handleLoadMore = useCallback(async () => {
    if (!onLoadMore || isLoadingMoreRef.current || !hasMore) {
      return;
    }
    isLoadingMoreRef.current = true;
    try {
      await onLoadMore();
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [onLoadMore, hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) {
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, handleLoadMore]);

  return { sentinelRef };
}
