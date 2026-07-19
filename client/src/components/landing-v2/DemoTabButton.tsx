import React from 'react';

import { type DemoTab } from './constants';

interface DemoTabButtonProps {
  name: DemoTab;
  label: string;
  tabRef: React.RefObject<HTMLButtonElement | null>;
  isActive: boolean;
  isBumped: boolean;
  count: number;
  onActivate: (name: DemoTab) => void;
}

/** One inbox-mode tab (Triage / Action / Follow Up) in the live demo header. */
export const DemoTabButton: React.FC<DemoTabButtonProps> = ({
  name,
  label,
  tabRef,
  isActive,
  isBumped,
  count,
  onActivate,
}) => (
  <button
    type="button"
    ref={tabRef}
    className={`demo-tab${isActive ? ' active' : ''}${isBumped ? ' bump' : ''}`}
    onClick={() => onActivate(name)}
  >
    {label} <span className="count">{count}</span>
  </button>
);
