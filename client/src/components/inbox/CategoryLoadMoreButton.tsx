import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface CategoryLoadMoreButtonProps {
  remainingCount: number;
  isLoading: boolean;
  onLoadMore: () => void;
}

/** Dims the button while the next page is in flight. */
const LOADING_OPACITY = 0.7;
const IDLE_OPACITY = 1;

/** Built at render time (not module load) so theme mocks in tests needn't cover these tokens. */
function getButtonStyle(isLoading: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    marginTop: theme.spacing.xs,
    background: theme.colors.common.transparent,
    border: `1px dashed ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.primary.dark,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    cursor: isLoading ? 'wait' : 'pointer',
    opacity: isLoading ? LOADING_OPACITY : IDLE_OPACITY,
  };
}

/**
 * Footer of an expanded category accordion that has more rows than its first page:
 * loads the next page on demand instead of shipping every row up front.
 */
export const CategoryLoadMoreButton: React.FC<CategoryLoadMoreButtonProps> = ({
  remainingCount,
  isLoading,
  onLoadMore,
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-testid="category-load-more"
      onClick={onLoadMore}
      disabled={isLoading}
      aria-busy={isLoading}
      style={getButtonStyle(isLoading)}
    >
      {isLoading ? t('inbox.category.loadingMore') : t('inbox.category.loadMore', { count: remainingCount })}
    </button>
  );
};
