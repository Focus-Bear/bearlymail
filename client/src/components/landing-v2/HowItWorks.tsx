import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { STEP_AUTOCYCLE_MS, STEP_COUNT } from './constants';
import { StepRanked } from './steps/StepRanked';
import { StepSchedule } from './steps/StepSchedule';
import { StepSnooze } from './steps/StepSnooze';
import { StepUrgency } from './steps/StepUrgency';

const STEP_KEYS = ['urgent', 'schedule', 'ranked', 'snooze'] as const;

const STEP_VISUALS: Record<number, React.FC> = {
  1: StepUrgency,
  2: StepSchedule,
  3: StepRanked,
  4: StepSnooze,
};

export const HowItWorks: React.FC = () => {
  const { t } = useTranslation();
  const [active, setActive] = useState(1);
  const interactedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (interactedRef.current) {
        return;
      }
      setActive(previous => (previous % STEP_COUNT) + 1);
    }, STEP_AUTOCYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const ActiveVisual = STEP_VISUALS[active];

  return (
    <section id="how">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">{t('landing.v2.steps.kicker')}</span>
          <h2 className="section-title">
            {t('landing.v2.steps.titlePre')}
            <em>{t('landing.v2.steps.titleEm')}</em>
            {t('landing.v2.steps.titleAfter')}
          </h2>
          <p className="section-sub">{t('landing.v2.steps.sub')}</p>
        </div>

        <div className="steps">
          <div className="steps-list">
            {STEP_KEYS.map((key, index) => {
              const stepNumber = index + 1;
              return (
                <StepListItem
                  key={key}
                  stepKey={key}
                  stepNumber={stepNumber}
                  active={active === stepNumber}
                  onActivate={() => {
                    interactedRef.current = true;
                    setActive(stepNumber);
                  }}
                  onHover={() => {
                    interactedRef.current = true;
                  }}
                />
              );
            })}
          </div>

          <div className="step-visual">{ActiveVisual && <ActiveVisual />}</div>
        </div>
      </div>
    </section>
  );
};

interface StepListItemProps {
  stepKey: string;
  stepNumber: number;
  active: boolean;
  onActivate: () => void;
  onHover: () => void;
}

const StepListItem: React.FC<StepListItemProps> = ({ stepKey, stepNumber, active, onActivate, onHover }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`step${active ? ' active' : ''}`}
      onMouseEnter={onHover}
      onClick={onActivate}
    >
      <div className="n">0{stepNumber}</div>
      <div>
        <h3>{t(`landing.v2.steps.list.${stepKey}.title`)}</h3>
        <p
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: t(`landing.v2.steps.list.${stepKey}.body`) }}
        />
      </div>
    </button>
  );
};
