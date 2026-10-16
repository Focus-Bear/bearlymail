import React, { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { FOCUS_BEAR_URL, STEP_AUTOCYCLE_MS } from './constants';
import { StepConnect } from './steps/StepConnect';
import { StepRanked } from './steps/StepRanked';
import { StepSchedule } from './steps/StepSchedule';
import { StepSnooze } from './steps/StepSnooze';
import { StepUrgency } from './steps/StepUrgency';

const STEPS: { key: string; Visual: React.FC }[] = [
  { key: 'connect', Visual: StepConnect },
  { key: 'ranked', Visual: StepRanked },
  { key: 'urgent', Visual: StepUrgency },
  { key: 'schedule', Visual: StepSchedule },
  { key: 'snooze', Visual: StepSnooze },
];

export const HowItWorks: React.FC = () => {
  const { t } = useTranslation();
  const [active, setActive] = useState(1);
  const interactedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (interactedRef.current) {
        return;
      }
      setActive(previous => (previous % STEPS.length) + 1);
    }, STEP_AUTOCYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const ActiveVisual = STEPS[active - 1]?.Visual;

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
            {STEPS.map(({ key }, index) => {
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

        <FocusBearTip />
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
    <button type="button" className={`step${active ? ' active' : ''}`} onMouseEnter={onHover} onClick={onActivate}>
      <div className="n">{String(stepNumber).padStart(2, '0')}</div>
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

/** Nudges people to block their old webmail so BearlyMail stays the only inbox they check. */
const FocusBearTip: React.FC = () => {
  const { t } = useTranslation();
  return (
    <aside className="focus-tip">
      <span className="focus-tip-label">{t('landing.v2.steps.tip.label')}</span>
      <p>
        <Trans
          i18nKey="landing.v2.steps.tip.body"
          components={{
            focusBear: (
              <a href={FOCUS_BEAR_URL} className="focus-bear-link" target="_blank" rel="noopener noreferrer" />
            ),
          }}
        />
      </p>
    </aside>
  );
};
