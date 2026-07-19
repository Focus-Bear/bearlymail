import type { GitHubChecksSummary } from 'types/email';

import {
  GITHUB_CHECKS_STATE_FAILING,
  GITHUB_CHECKS_STATE_NONE,
  GITHUB_CHECKS_STATE_PASSING,
} from 'constants/strings';

/**
 * Result of resolving a CI checks summary into the small inline signal used
 * on the inbox-row badge. Pure data — the rendering component is responsible
 * for translating the i18n key.
 *
 * Returns null when there's nothing useful to show (state === 'none').
 */
export interface InboxCIResolved {
  state: 'passing' | 'failing' | 'pending';
  /** i18n key for the short inline label. */
  labelKey: string;
  /** Interpolation values for the i18n key (e.g. `{ names: 'tests, lint' }`). */
  labelValues: Record<string, string | number>;
  /** Title-attribute text for hover detail; empty when no detail to show. */
  titleText: string;
}

const FAILING_PREVIEW_COUNT = 2;

const PASSING: InboxCIResolved = {
  state: 'passing',
  labelKey: 'github.ci.passing',
  labelValues: {},
  titleText: '',
};

const PENDING: InboxCIResolved = {
  state: 'pending',
  labelKey: 'github.ci.pending',
  labelValues: {},
  titleText: '',
};

/**
 * Resolve a server-returned checks summary into the compact form rendered on
 * the inbox row. Returns null when the summary has no useful signal (no
 * check-runs reported, or summary missing entirely).
 */
export function resolveInboxCI(checks: GitHubChecksSummary | undefined): InboxCIResolved | null {
  if (!checks || checks.state === GITHUB_CHECKS_STATE_NONE) {
    return null;
  }

  if (checks.state === GITHUB_CHECKS_STATE_FAILING) {
    const previewNames = checks.failingChecks.slice(0, FAILING_PREVIEW_COUNT).join(', ');
    return {
      state: 'failing',
      labelKey: previewNames ? 'github.ci.failingWithNames' : 'github.ci.failing',
      labelValues: previewNames ? { names: previewNames } : {},
      titleText: checks.failingChecks.join(', '),
    };
  }

  if (checks.state === GITHUB_CHECKS_STATE_PASSING) {
    return PASSING;
  }

  return PENDING;
}
