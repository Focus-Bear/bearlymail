/**
 * AcceptInviteDemo — wraps AcceptInvite with all required providers for Storybook.
 *
 * AcceptInvite uses:
 *  - useParams (needs MemoryRouter + Route)
 *  - useNavigate (needs MemoryRouter)
 *  - useAuth (needs AuthContext)
 *  - useValidateInvite (React Query — seeded via QueryClient cache)
 *  - useAcceptInvite (React Query mutation — configured per scenario)
 *  - useTranslation (needs I18nextProvider)
 *
 * Each story scenario is controlled via props.
 *
 * The "loading" scenario patches axios.get to return a never-resolving promise so
 * the query stays in its loading state for the full duration of the story.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';

import { AuthContext } from 'contexts/AuthContext';
import AcceptInvite from 'pages/AcceptInvite';

// ---------------------------------------------------------------------------
// i18n translations for team.invite keys
// ---------------------------------------------------------------------------
const inviteI18n = i18n.createInstance();
inviteI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'team.invite.validating': 'Validating invite link…',
        'team.invite.invalidTitle': 'Invalid or Expired Invite',
        'team.invite.invalidBody':
          'This invite link is invalid or has already expired. Please ask your team admin for a new invite.',
        'team.invite.goToLogin': 'Go to Login',
        'team.invite.title': "You've been invited!",
        'team.invite.body': '{{inviter}} has invited you to join {{org}} as a {{role}}.',
        'team.invite.someone': 'Someone',
        'team.invite.loginRequired': 'Please log in or create an account to accept this invite.',
        'team.invite.loginToAccept': 'Log in to Accept',
        'team.invite.accept': 'Accept Invite',
        'team.invite.accepting': 'Accepting…',
        'team.invite.acceptError': 'Failed to accept invite. Please try again.',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------------------------------------------------------------------------
// Mock AuthContext shapes
// ---------------------------------------------------------------------------
const noUserAuth = {
  user: null,
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshUser: async () => {},
};

const loggedInAuth = {
  user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshUser: async () => {},
};

// ---------------------------------------------------------------------------
// Query data shapes
// ---------------------------------------------------------------------------
const FAKE_TOKEN = 'demo-invite-token-abc123';

type ScenarioKey = 'loading' | 'invalid' | 'readyGuest' | 'readyLoggedIn' | 'accepting' | 'acceptError';

function buildQueryClient(scenario: ScenarioKey): QueryClient {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  switch (scenario) {
    case 'loading':
      // Override the queryFn for this key to never resolve — React Query will stay
      // in isLoading: true state for the lifetime of the story.
      qc.setQueryDefaults(['invite', 'validate', FAKE_TOKEN], {
        queryFn: () => new Promise<{ valid: boolean }>(() => {}),
        retry: false,
      });
      break;

    case 'invalid':
      qc.setQueryData(['invite', 'validate', FAKE_TOKEN], {
        valid: false,
      });
      break;

    case 'readyGuest':
    case 'readyLoggedIn':
      qc.setQueryData(['invite', 'validate', FAKE_TOKEN], {
        valid: true,
        orgName: 'Acme Corp',
        inviterName: 'Bob Smith',
        role: 'member',
        email: 'alice@example.com',
      });
      break;

    case 'accepting':
      qc.setQueryData(['invite', 'validate', FAKE_TOKEN], {
        valid: true,
        orgName: 'Acme Corp',
        inviterName: 'Bob Smith',
        role: 'member',
        email: 'alice@example.com',
      });
      break;

    case 'acceptError':
      qc.setQueryData(['invite', 'validate', FAKE_TOKEN], {
        valid: true,
        orgName: 'Acme Corp',
        inviterName: 'Bob Smith',
        role: 'member',
        email: 'alice@example.com',
      });
      break;
  }

  return qc;
}

// ---------------------------------------------------------------------------
// Demo component
// ---------------------------------------------------------------------------
export interface AcceptInviteDemoProps {
  scenario: ScenarioKey;
}

export const AcceptInviteDemo: React.FC<AcceptInviteDemoProps> = ({ scenario }) => {
  const queryClient = React.useMemo(() => buildQueryClient(scenario), [scenario]);
  const authValue =
    scenario === 'readyLoggedIn' || scenario === 'accepting' || scenario === 'acceptError' ? loggedInAuth : noUserAuth;

  return (
    <I18nextProvider i18n={inviteI18n}>
      {/* @ts-ignore — partial auth mock sufficient for story isolation */}
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/accept-invite/${FAKE_TOKEN}`]}>
            <Routes>
              <Route path="/accept-invite/:token" element={<AcceptInviteWithMutation scenario={scenario} />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>
    </I18nextProvider>
  );
};

// ---------------------------------------------------------------------------
// AcceptInviteWithMutation — thin wrapper that patches the mutation state
// for 'accepting' and 'acceptError' scenarios by monkey-patching the
// useMutation hook result via a context-level QueryClient override.
//
// For 'accepting': we render a visual overlay simulating the pending state
// since we can't intercept the mutation without MSW. The real component is
// still rendered with the accept button shown; below we use a separate
// PendingOverlay approach.
//
// For simplicity: render AcceptInvite directly. For 'accepting'/'acceptError'
// states we show an explanatory banner overlaid.
// ---------------------------------------------------------------------------
const AcceptInviteWithMutation: React.FC<{ scenario: ScenarioKey }> = ({ scenario }) => {
  return (
    <div style={{ position: 'relative' }}>
      <AcceptInvite />
      {scenario === 'accepting' && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          📌 Story note: Click "Accept Invite" to see the pending/loading button state.
        </div>
      )}
      {scenario === 'acceptError' && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(180,0,0,0.85)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          📌 Story note: Click "Accept Invite" to trigger the error state (API is not available in Storybook).
        </div>
      )}
    </div>
  );
};
