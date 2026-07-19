import React from 'react';

import { type PrioChoice } from './constants';

interface PrioButtonProps {
  prio: PrioChoice;
  label: string;
  emoji: string;
  selected: boolean;
  pulse: boolean;
  onClick: (prio: PrioChoice) => void;
}

/** One of the three priority reactions on the live-demo email card. */
export const PrioButton: React.FC<PrioButtonProps> = ({
  prio,
  label,
  emoji,
  selected,
  pulse,
  onClick,
}) => (
  <button
    type="button"
    className={`prio-btn${pulse ? ' pulse' : ''}${selected ? ' active' : ''}`}
    onClick={() => onClick(prio)}
  >
    <span className="emo">{emoji}</span>
    <span className="emo-l">{label}</span>
  </button>
);
