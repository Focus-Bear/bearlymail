import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { OPACITY_DISABLED_ALT } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

/** The only account the seed/delete controls are shown to (backend enforces the same). */
export const TESTER_EMAIL = 'testerbearlymail@gmail.com';

const BUSY_DELETE = 'delete';
const STATUS_OK = 'ok';
const STATUS_ERROR = 'error';

type PersonaKey = 'product-manager' | 'founder' | 'engineering-manager';

const PERSONAS: { key: PersonaKey; labelKey: string }[] = [
  { key: 'product-manager', labelKey: 'settings.seedTestData.personaProductManager' },
  { key: 'founder', labelKey: 'settings.seedTestData.personaFounder' },
  { key: 'engineering-manager', labelKey: 'settings.seedTestData.personaEngineeringManager' },
];

const sectionStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.lg,
  padding: theme.spacing.xl,
  marginBottom: theme.spacing.lg,
  boxShadow: theme.shadows.md,
  border: `1px dashed ${theme.colors.border.medium}`,
};

const titleStyle: React.CSSProperties = {
  color: theme.colors.text.primary,
  marginBottom: theme.spacing.sm,
  fontSize: theme.typography.fontSize.xl,
};

const descriptionStyle: React.CSSProperties = {
  color: theme.colors.text.secondary,
  marginBottom: theme.spacing.lg,
  fontSize: theme.typography.fontSize.sm,
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.spacing.sm,
  marginBottom: theme.spacing.md,
};

const baseButtonStyle: React.CSSProperties = {
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.medium,
  transition: theme.transitions.default,
};

const seedButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  backgroundColor: theme.colors.primary.main,
  color: COLOR_NAMED_WHITE,
};

const deleteButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  backgroundColor: 'transparent',
  color: theme.colors.error.main,
  border: `1px solid ${theme.colors.error.main}`,
};

/**
 * Test-only Settings card: seeds or deletes a realistic demo inbox for one of three
 * personas. Rendered only for the test account (gated in Settings.tsx); the backend
 * also enforces the tester-only guard.
 */
export const SeedTestDataSection: React.FC = () => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const seed = async (persona: PersonaKey) => {
    setBusy(persona);
    setStatus(null);
    try {
      const response = await axios.post(`${API_URL}/seed-test-data`, { persona });
      setStatus({
        kind: STATUS_OK,
        message: t('settings.seedTestData.seededSuccess', {
          count: response.data.seeded,
          persona: t(PERSONAS.find(entry => entry.key === persona)?.labelKey ?? ''),
        }),
      });
    } catch (error) {
      console.error('[SeedTestData] seed failed', error);
      setStatus({ kind: STATUS_ERROR, message: t('settings.seedTestData.error') });
    } finally {
      setBusy(null);
    }
  };

  const deleteAll = async () => {
    if (!window.confirm(t('settings.seedTestData.deleteConfirm'))) {
      return;
    }
    setBusy(BUSY_DELETE);
    setStatus(null);
    try {
      const response = await axios.delete(`${API_URL}/seed-test-data`);
      setStatus({
        kind: STATUS_OK,
        message: t('settings.seedTestData.deletedSuccess', { count: response.data.deleted }),
      });
    } catch (error) {
      console.error('[SeedTestData] delete failed', error);
      setStatus({ kind: STATUS_ERROR, message: t('settings.seedTestData.error') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div id="seed-test-data" style={sectionStyle}>
      <h2 style={titleStyle}>🧪 {t('settings.seedTestData.title')}</h2>
      <p style={descriptionStyle}>{t('settings.seedTestData.description')}</p>

      <div style={buttonRowStyle}>
        {PERSONAS.map(persona => (
          <button
            key={persona.key}
            type="button"
            style={{ ...seedButtonStyle, opacity: busy ? OPACITY_DISABLED_ALT : 1 }}
            disabled={busy !== null}
            onClick={() => seed(persona.key)}
          >
            {busy === persona.key
              ? t('settings.seedTestData.seeding')
              : t('settings.seedTestData.seedButton', { persona: t(persona.labelKey) })}
          </button>
        ))}
      </div>

      <button
        type="button"
        style={{ ...deleteButtonStyle, opacity: busy ? OPACITY_DISABLED_ALT : 1 }}
        disabled={busy !== null}
        onClick={deleteAll}
      >
        {busy === BUSY_DELETE ? t('settings.seedTestData.deleting') : t('settings.seedTestData.delete')}
      </button>

      {status && (
        <p
          style={{
            marginTop: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
            color: status.kind === STATUS_OK ? theme.colors.success.main : theme.colors.error.main,
          }}
        >
          {status.message}
        </p>
      )}
    </div>
  );
};
