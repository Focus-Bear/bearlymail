import { useRef } from 'react';

/**
 * Tour element refs for the inbox onboarding tour.
 * Extracted from useInboxState to reduce its statement count.
 */
export function useInboxTourRefs() {
  const triageTabRef = useRef<HTMLButtonElement>(null);
  const actionTabRef = useRef<HTMLButtonElement>(null);
  const followUpTabRef = useRef<HTMLButtonElement>(null);
  const deliverBtnRef = useRef<HTMLButtonElement>(null);
  const emailListRef = useRef<HTMLDivElement>(null);
  const emailDetailRef = useRef<HTMLDivElement>(null);

  return { triageTabRef, actionTabRef, followUpTabRef, deliverBtnRef, emailListRef, emailDetailRef };
}
