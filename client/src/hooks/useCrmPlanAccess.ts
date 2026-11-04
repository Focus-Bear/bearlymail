import { useVolumeUsage } from 'queries/useOrgUsage';

export interface CrmPlanAccess {
  /** Whether the user's plan includes the CRM. */
  isCrmIncluded: boolean;
  /** True until the plan has loaded, so callers can avoid flashing the upgrade prompt. */
  isPlanLoading: boolean;
}

/**
 * Whether the user's plan includes the CRM (Growth and up, or a trial). The
 * server enforces it on every CRM endpoint; this only drives the UI. If usage
 * fails to load it reports the CRM as included and lets the server decide.
 */
export function useCrmPlanAccess(): CrmPlanAccess {
  const { data: volumeUsage, isLoading } = useVolumeUsage();
  return {
    isCrmIncluded: volumeUsage?.includesCrm !== false,
    isPlanLoading: isLoading,
  };
}
