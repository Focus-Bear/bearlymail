import React from 'react';
import { useTranslation } from 'react-i18next';

import { HERO_VIDEO_EMBED_URL } from './constants';

const VIDEO_EMBED_PERMISSIONS = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';

/**
 * 16:9 slot for the hero product video. Renders the embed once
 * HERO_VIDEO_EMBED_URL is set; until then it shows a calm "coming soon" frame so
 * the hero layout doesn't shift when the real video lands.
 */
export const HeroVideo: React.FC = () => {
  const { t } = useTranslation();
  return (
    <figure className="hero-video">
      <div className="hero-video-frame">
        {HERO_VIDEO_EMBED_URL ? (
          <iframe
            src={HERO_VIDEO_EMBED_URL}
            title={t('landing.v2.video.title')}
            allow={VIDEO_EMBED_PERMISSIONS}
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <HeroVideoPlaceholder />
        )}
      </div>
      <figcaption className="hero-video-caption">{t('landing.v2.video.caption')}</figcaption>
    </figure>
  );
};

const HeroVideoPlaceholder: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="hero-video-placeholder" role="img" aria-label={t('landing.v2.video.comingSoon')}>
      <span className="hero-video-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
        </svg>
      </span>
      <span className="hero-video-soon">{t('landing.v2.video.comingSoon')}</span>
    </div>
  );
};
