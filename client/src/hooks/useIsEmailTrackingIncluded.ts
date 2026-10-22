import { useVolumeUsage } from 'queries/useOrgUsage';

/**
 * Whether the user's plan includes email open tracking. The server enforces it
 * on every send; this only drives the UI. Until usage loads (or against a
 * server that predates plan gating) it reports true, so the tracking controls
 * don't flash a locked state for users who have the feature.
 */
export function useIsEmailTrackingIncluded(): boolean {
  const { data: volumeUsage } = useVolumeUsage();
  return volumeUsage?.includesEmailTracking !== false;
}
