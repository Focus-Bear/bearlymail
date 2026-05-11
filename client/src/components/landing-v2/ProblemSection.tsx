/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { useTranslation } from 'react-i18next';

export const ProblemSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section className="section-band">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">{t('landing.v2.problem.kicker')}</span>
          <h2 className="section-title">
            {t('landing.v2.problem.titlePre')}
            <em>{t('landing.v2.problem.titleEm')}</em>
            {t('landing.v2.problem.titleAfter')}
          </h2>
          <p className="section-sub">{t('landing.v2.problem.sub')}</p>
        </div>

        <div className="problems">
          <BuriedCard />
          <EquallyUrgentCard />
          <EngineCard />
        </div>
      </div>
    </section>
  );
};

const BuriedCard: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="problem-card">
      <div className="num">01</div>
      <h3>{t('landing.v2.problem.cards.buried.title')}</h3>
      <p>{t('landing.v2.problem.cards.buried.body')}</p>
      <div className="demo-mini">
        <div className="row">
          <span>Re: Lunch?</span>
          <b>10:42</b>
        </div>
        <div className="row strike">
          <span>Investor follow-up</span>
          <span>09:18</span>
        </div>
        <div className="row strike">
          <span>Major customer issue</span>
          <span>Yesterday</span>
        </div>
      </div>
    </div>
  );
};

const EquallyUrgentCard: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="problem-card">
      <div className="num">02</div>
      <h3>{t('landing.v2.problem.cards.equallyUrgent.title')}</h3>
      <p>{t('landing.v2.problem.cards.equallyUrgent.body')}</p>
      <div className="demo-mini">
        <div className="row">
          <span>Black Friday — 50% off!</span>
          <b className="mini-muted">{t('landing.v2.problem.minis.urgentQuestion')}</b>
        </div>
        <div className="row">
          <span>Your weekly digest</span>
          <b className="mini-muted">{t('landing.v2.problem.minis.urgentQuestion')}</b>
        </div>
        <div className="row">
          <span>Receipt #7842</span>
          <b className="mini-muted">{t('landing.v2.problem.minis.urgentQuestion')}</b>
        </div>
      </div>
    </div>
  );
};

const EngineCard: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="problem-card">
      <div className="num">03</div>
      <h3>{t('landing.v2.problem.cards.engine.title')}</h3>
      <p>{t('landing.v2.problem.cards.engine.body')}</p>
      <div className="demo-mini">
        <div className="row">
          <span className="mini-accent">{t('landing.v2.problem.minis.decide')}</span>
          <b>0.4s</b>
        </div>
        <div className="row">
          <span className="mini-accent">{t('landing.v2.problem.minis.decide')}</span>
          <b>0.6s</b>
        </div>
        <div className="row">
          <span className="mini-accent">{t('landing.v2.problem.minis.open')}</span>
          <b>15s</b>
        </div>
        <div className="row">
          <span>{t('landing.v2.problem.minis.messagesToday')}</span>
          <b className="mini-red">{t('landing.v2.problem.minis.wasted')}</b>
        </div>
      </div>
    </div>
  );
};
