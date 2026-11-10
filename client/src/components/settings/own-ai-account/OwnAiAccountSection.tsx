import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { AI_PROVIDERS, SELF_HOSTING_DOCS_URL } from 'constants/ownAiAccount';
import { SETTINGS_ANCHORS } from 'constants/settingsAnchors';
import { useOwnAiKeys } from 'hooks/settings/useOwnAiKeys';

import { AiProviderKeyRow } from './AiProviderKeyRow';
import { bodyTextStyle, headingStyle, linkStyle, primaryButtonStyle, sectionCardStyle } from './ownAiAccountStyles';

/**
 * "Use your own AI account": explains why someone would bring their own AI
 * provider keys (data sovereignty) and that self-hosting is the alternative.
 * The key fields stay hidden until the user asks for them, unless a key is
 * already saved.
 */
export const OwnAiAccountSection: React.FC = () => {
  const { t } = useTranslation();
  const { isLoaded, hasAnyKey, statusFor, saveKey, removeKey } = useOwnAiKeys();
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (isLoaded && hasAnyKey) {
setIsExpanded(true);
}
  }, [isLoaded, hasAnyKey]);

  const expand = () => {
    captureEvent(ANALYTICS_EVENTS.OWN_AI_ACCOUNT_EXPANDED);
    setIsExpanded(true);
  };

  return (
    <section id={SETTINGS_ANCHORS.OWN_AI_ACCOUNT} style={sectionCardStyle}>
      <h2 style={headingStyle}>{t('settings.ownAiAccount.title')}</h2>
      <p style={bodyTextStyle}>{t('settings.ownAiAccount.why')}</p>
      <p style={bodyTextStyle}>{t('settings.ownAiAccount.howItWorks')}</p>
      <p style={bodyTextStyle}>
        <Trans
          i18nKey="settings.ownAiAccount.selfHost"
          components={{
            selfHostLink: <a href={SELF_HOSTING_DOCS_URL} target="_blank" rel="noopener noreferrer" style={linkStyle} />,
          }}
        />
      </p>

      {isExpanded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {AI_PROVIDERS.map(provider => (
            <AiProviderKeyRow
              key={provider.id}
              provider={provider}
              status={statusFor(provider.id)}
              onSave={key => saveKey(provider.id, key)}
              onRemove={() => removeKey(provider.id)}
            />
          ))}
        </div>
      ) : (
        <button type="button" style={primaryButtonStyle(true)} onClick={expand}>
          {t('settings.ownAiAccount.useMyKeys')}
        </button>
      )}
    </section>
  );
};
