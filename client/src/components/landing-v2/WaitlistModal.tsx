/* eslint-disable i18next/no-literal-string, max-lines-per-function */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { WAITLIST_STATUS_ALREADY_ON_LIST } from 'constants/strings';

import { KEY_ESCAPE } from './constants';
import { closeWaitlist, useWaitlistState } from './waitlistStore';

const EMAIL_SYSTEM_OPTIONS = [
  { value: 'gmail', labelKey: 'landing.v2.modal.systems.gmail' },
  { value: 'outlook', labelKey: 'landing.v2.modal.systems.outlook' },
  { value: 'icloud', labelKey: 'landing.v2.modal.systems.icloud' },
  { value: 'protonmail', labelKey: 'landing.v2.modal.systems.protonmail' },
  { value: 'fastmail', labelKey: 'landing.v2.modal.systems.fastmail' },
  { value: 'zoho', labelKey: 'landing.v2.modal.systems.zoho' },
  { value: 'other', labelKey: 'landing.v2.modal.systems.other' },
];

export const WaitlistModal: React.FC = () => {
  const { t } = useTranslation();
  const state = useWaitlistState();
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [emailSystem, setEmailSystem] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (state.open) {
      setEmail(prev => state.prefillEmail || prev);
      setError('');
      setNotice('');
      setSuccess(false);
    }
  }, [state.open, state.prefillEmail]);

  useEffect(() => {
    if (!state.open) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE) {
        closeWaitlist();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await axios.post(`${API_URL}/waitlist`, { email, firstName, reason, emailSystem });
      if (response.data?.status === WAITLIST_STATUS_ALREADY_ON_LIST) {
        setNotice(t('landing.v2.modal.alreadyOnList'));
        return;
      }
      captureEvent(ANALYTICS_EVENTS.WAIT_LIST_SUBMITTED);
      setSuccess(true);
    } catch (err) {
      const fallback = t('landing.v2.modal.error');
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.message === 'string'
          ? err.response.data.message
          : fallback;
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`modal-bg${state.open ? ' open' : ''}`}
      onClick={event => {
        if (event.target === event.currentTarget) {
          closeWaitlist();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal">
        <button
          type="button"
          className="modal-close"
          aria-label={t('landing.v2.modal.closeLabel')}
          onClick={closeWaitlist}
        >
          ✕
        </button>
        {success ? (
          <WaitlistSuccess />
        ) : (
          <WaitlistForm
            firstName={firstName}
            email={email}
            emailSystem={emailSystem}
            reason={reason}
            submitting={submitting}
            error={error}
            notice={notice}
            onFirstName={setFirstName}
            onEmail={setEmail}
            onEmailSystem={setEmailSystem}
            onReason={setReason}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
};

interface FormProps {
  firstName: string;
  email: string;
  emailSystem: string;
  reason: string;
  submitting: boolean;
  error: string;
  notice: string;
  onFirstName: (value: string) => void;
  onEmail: (value: string) => void;
  onEmailSystem: (value: string) => void;
  onReason: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

const WaitlistForm: React.FC<FormProps> = ({
  firstName,
  email,
  emailSystem,
  reason,
  submitting,
  error,
  notice,
  onFirstName,
  onEmail,
  onEmailSystem,
  onReason,
  onSubmit,
}) => {
  const { t } = useTranslation();
  return (
    <div>
      <h3>
        {t('landing.v2.modal.titlePre')}
        <em>{t('landing.v2.modal.titleEm')}</em>
        {t('landing.v2.modal.titleAfter')}
      </h3>
      <p className="modal-sub">{t('landing.v2.modal.sub')}</p>
      {error && <div className="modal-error">{error}</div>}
      {notice && <div className="modal-notice">{notice}</div>}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="wl-fn">{t('landing.v2.modal.firstName')}</label>
          <input
            id="wl-fn"
            required
            type="text"
            placeholder={t('landing.v2.modal.firstNamePlaceholder')}
            value={firstName}
            onChange={event => onFirstName(event.target.value)}
            onBlur={() => {
              if (firstName) {
                captureEvent(ANALYTICS_EVENTS.WAIT_LIST_NAME_ENTERED);
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="wl-email">{t('landing.v2.modal.email')}</label>
          <input
            id="wl-email"
            required
            type="email"
            placeholder={t('landing.v2.modal.emailPlaceholder')}
            value={email}
            onChange={event => onEmail(event.target.value)}
            onBlur={() => {
              if (email) {
                captureEvent(ANALYTICS_EVENTS.WAIT_LIST_EMAIL_ENTERED);
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="wl-system">{t('landing.v2.modal.systemLabel')}</label>
          <select
            id="wl-system"
            required
            value={emailSystem}
            onChange={event => {
              onEmailSystem(event.target.value);
              if (event.target.value) {
                captureEvent(ANALYTICS_EVENTS.WAIT_LIST_EMAIL_PLATFORM_SELECTED);
              }
            }}
          >
            <option value="">{t('landing.v2.modal.systemPlaceholder')}</option>
            {EMAIL_SYSTEM_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="wl-why">{t('landing.v2.modal.why')}</label>
          <textarea
            id="wl-why"
            placeholder={t('landing.v2.modal.whyPlaceholder')}
            value={reason}
            onChange={event => onReason(event.target.value)}
            onBlur={() => {
              if (reason) {
                captureEvent(ANALYTICS_EVENTS.WAIT_LIST_REASON_ENTERED);
              }
            }}
          />
          <div className="hint">{t('landing.v2.modal.whyHint')}</div>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={closeWaitlist}>
            {t('landing.v2.modal.cancel')}
          </button>
          <button type="submit" className="btn btn-sun btn-lg" disabled={submitting}>
            {submitting ? t('landing.v2.modal.submitting') : t('landing.v2.modal.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};

const WaitlistSuccess: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="modal-success">
      <div className="check">✓</div>
      <h3 className="modal-success-title">{t('landing.v2.modal.success.title')}</h3>
      <p className="modal-sub modal-success-sub">{t('landing.v2.modal.success.body')}</p>
      <div className="actions">
        <button type="button" className="btn btn-outline" onClick={closeWaitlist}>
          {t('landing.v2.modal.success.close')}
        </button>
        <a className="btn btn-sun" href="#story" onClick={closeWaitlist}>
          {t('landing.v2.modal.success.readStory')}
        </a>
      </div>
    </div>
  );
};
