import React from 'react';
import { useTranslation } from 'react-i18next';

const WHY_NOT_CLAUDE_PREFIX = 'landing.v2.whyNotClaude';
const PARAGRAPH_KEYS = ['trust', 'job', 'value'] as const;

/** Answers the "why not just let an AI assistant handle my email?" objection. */
export const WhyNotClaudeSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section id="why-not-claude">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">{t(`${WHY_NOT_CLAUDE_PREFIX}.kicker`)}</span>
          <h2 className="section-title">
            {t(`${WHY_NOT_CLAUDE_PREFIX}.titlePre`)}
            <em>{t(`${WHY_NOT_CLAUDE_PREFIX}.titleEm`)}</em>
          </h2>
        </div>
        <div className="why-not-claude-body">
          {PARAGRAPH_KEYS.map(paragraphKey => (
            <p key={paragraphKey}>{t(`${WHY_NOT_CLAUDE_PREFIX}.paragraphs.${paragraphKey}`)}</p>
          ))}
        </div>
      </div>
    </section>
  );
};
