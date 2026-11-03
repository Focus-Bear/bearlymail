import React from 'react';

import { LegalList } from 'components/legal/LegalList';
import { LegalParagraph } from 'components/legal/LegalParagraph';
import { PRIVACY_CONTACT_EMAIL } from 'constants/legal';

// Australian Privacy Principle 1.8 (from 10 December 2026) requires these three lists: the kinds of personal
// information used, the decisions made solely by computer programs, and the decisions they substantially help make.
const INFORMATION_USED = [
  'The content and metadata of your emails, including information about the people you correspond with',
  'Your saved goals, current work and urgent or not-urgent topics',
  'Your categories, rules and preferences, and the corrections you make to earlier decisions',
];

const DECISIONS_MADE_AUTOMATICALLY = [
  'Which category each email goes into and how urgent it is, which sets the order and grouping of your inbox',
  'Whether an email looks like phishing, and what type of email or contact it is',
  'Whether the rules and workflows you have set up apply to an email',
  'If you turn on auto-replies (they are off by default), whether an incoming email gets one',
];

const DECISIONS_PROGRAMS_HELP_WITH = [
  'Summaries and action items',
  'Draft replies and follow-ups, and checks of a draft’s tone',
  'Suggested categories and rules',
  'Search results and answers from Ask AI',
];

export const AutomatedDecisionsContent: React.FC = () => (
  <>
    <LegalParagraph>
      BearlyMail uses computer programs, including the AI providers in section 5.1 and a model trained on your own email
      (section 3.2), to make some decisions about your email automatically and to help you with others. They use:
    </LegalParagraph>
    <LegalList items={INFORMATION_USED} />
    <LegalParagraph>Decisions these programs make on their own:</LegalParagraph>
    <LegalList items={DECISIONS_MADE_AUTOMATICALLY} />
    <LegalParagraph>
      Things these programs produce to help you decide, which you can use, change or ignore. Apart from auto-replies you
      turn on and emails you schedule, BearlyMail does not send email without you sending it:
    </LegalParagraph>
    <LegalList items={DECISIONS_PROGRAMS_HELP_WITH} />
    <LegalParagraph>
      These decisions organise your own inbox. We do not use them to decide your eligibility for anything, such as
      credit, employment, insurance or housing, or to set prices. You can move or reprioritise any email, change your
      categories and rules, and edit or discard anything AI produces. AI output can be wrong, so check it before relying
      on it. To find out how a decision about you was made, ask for a person to review it, or tell us you disagree with
      it, email {PRIVACY_CONTACT_EMAIL}.
    </LegalParagraph>
  </>
);

export const PersonalModelContent: React.FC = () => (
  <LegalParagraph>
    To categorise and prioritise your email faster, we may train a small model for your account only. It learns from
    your own email history and the categories and priorities given to it, including your corrections. The training data
    and the model are stored in our private, encrypted storage in Sydney, Australia, are not shared with the AI
    providers in section 5.1, and are never used for anyone else’s account.
  </LegalParagraph>
);
