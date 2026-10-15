import React from 'react';
import { useTranslation } from 'react-i18next';

const PROBLEM_PREFIX = 'landing.v2.problem';

/** Inbox rows in time order; the important ones sink below the chatter. */
const BURIED_ROWS = [
  { id: 'lunch', important: false },
  { id: 'offsite', important: false },
  { id: 'investor', important: true },
  { id: 'customer', important: true },
] as const;

/** Wildly different emails that all arrive with identical visual weight. */
const EQUAL_WEIGHT_ROWS = ['sale', 'churn', 'digest'] as const;

/** The final stat is the punchline and is styled as a running total. */
const ENGINE_TOTAL_STAT = 'total';
const ENGINE_STATS = ['emails', 'decide', ENGINE_TOTAL_STAT] as const;

export const ProblemSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section className="section-band">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">{t(`${PROBLEM_PREFIX}.kicker`)}</span>
          <h2 className="section-title">
            {t(`${PROBLEM_PREFIX}.titlePre`)}
            <em>{t(`${PROBLEM_PREFIX}.titleEm`)}</em>
            {t(`${PROBLEM_PREFIX}.titleAfter`)}
          </h2>
          <p className="section-sub">{t(`${PROBLEM_PREFIX}.sub`)}</p>
        </div>

        <div className="problems">
          <ProblemCard cardKey="buried" number={1}>
            <BuriedMini />
          </ProblemCard>
          <ProblemCard cardKey="equallyUrgent" number={2}>
            <EqualWeightMini />
          </ProblemCard>
          <ProblemCard cardKey="engine" number={3}>
            <EngineMini />
          </ProblemCard>
        </div>
      </div>
    </section>
  );
};

interface ProblemCardProps {
  cardKey: string;
  number: number;
  children: React.ReactNode;
}

/** Card rows (number, title, body, visual) sit on a shared subgrid so every
 * card's title, copy and mini-visual line up across the row. */
const ProblemCard: React.FC<ProblemCardProps> = ({ cardKey, number, children }) => {
  const { t } = useTranslation();
  return (
    <article className="problem-card">
      <span className="problem-num">{String(number).padStart(2, '0')}</span>
      <h3>{t(`${PROBLEM_PREFIX}.cards.${cardKey}.title`)}</h3>
      <p>{t(`${PROBLEM_PREFIX}.cards.${cardKey}.body`)}</p>
      <div className="problem-mini" aria-hidden="true">
        {children}
      </div>
    </article>
  );
};

const BuriedMini: React.FC = () => {
  const { t } = useTranslation();
  return (
    <ul className="mini-list">
      {BURIED_ROWS.map(row => (
        <li key={row.id} className={row.important ? 'mini-row mini-row-buried' : 'mini-row'}>
          <span className="mini-subject">{t(`${PROBLEM_PREFIX}.minis.buried.${row.id}`)}</span>
          {row.important && (
            <span className="mini-tag mini-tag-important">{t(`${PROBLEM_PREFIX}.minis.buried.importantTag`)}</span>
          )}
          <span className="mini-meta">{t(`${PROBLEM_PREFIX}.minis.buried.${row.id}Time`)}</span>
        </li>
      ))}
    </ul>
  );
};

const EqualWeightMini: React.FC = () => {
  const { t } = useTranslation();
  return (
    <ul className="mini-list">
      {EQUAL_WEIGHT_ROWS.map(rowId => (
        <li key={rowId} className="mini-row">
          <span className="mini-unread" />
          <span className="mini-subject">{t(`${PROBLEM_PREFIX}.minis.equallyUrgent.${rowId}`)}</span>
          <span className="mini-tag">{t(`${PROBLEM_PREFIX}.minis.equallyUrgent.newTag`)}</span>
        </li>
      ))}
    </ul>
  );
};

const EngineMini: React.FC = () => {
  const { t } = useTranslation();
  return (
    <ul className="mini-list">
      {ENGINE_STATS.map(statKey => (
        <li key={statKey} className={statKey === ENGINE_TOTAL_STAT ? 'mini-row mini-row-total' : 'mini-row'}>
          <span className="mini-subject">{t(`${PROBLEM_PREFIX}.minis.engine.${statKey}`)}</span>
          <span className="mini-value">{t(`${PROBLEM_PREFIX}.minis.engine.${statKey}Value`)}</span>
        </li>
      ))}
    </ul>
  );
};
