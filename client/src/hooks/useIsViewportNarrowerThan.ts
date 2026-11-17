import { useEffect, useState } from 'react';

/** True while the window is narrower than `breakpointPx`; for layouts that need their own breakpoint. */
export const useIsViewportNarrowerThan = (breakpointPx: number): boolean => {
  const [isNarrower, setIsNarrower] = useState(false);

  useEffect(() => {
    const checkWidth = () => setIsNarrower(window.innerWidth < breakpointPx);
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, [breakpointPx]);

  return isNarrower;
};
