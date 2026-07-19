import './i18n'; // Initialize i18n
import './App.css';

import React, { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import { QueryProvider } from 'providers/QueryProvider';
import { theme } from 'theme/theme';

import { AdminMfaProvider } from 'components/admin/AdminMfaGate';
import { ConsentModal } from 'components/ConsentModal';
import { AiLimitBanner } from 'components/notifications/AiLimitBanner';
import { SetupWizard } from 'components/setup-wizard';
import { API_URL } from 'config/api';
import { AuthProvider, useAuth } from 'contexts/AuthContext';
import { NotificationProvider } from 'contexts/NotificationContext';
import AcceptInvite from 'pages/AcceptInvite';
import AdminDashboard from 'pages/AdminDashboard';
import AuthError from 'pages/AuthError';
import BookingCancelPage from 'pages/BookingCancelPage';
import BookingPage from 'pages/BookingPage';
import BookingReschedulePage from 'pages/BookingReschedulePage';
import Compose from 'pages/Compose';
import ContactDetail from 'pages/ContactDetail';
import ContactGroups from 'pages/ContactGroups';
import Contacts from 'pages/Contacts';
import Deals from 'pages/Deals';
import EmailDetail from 'pages/EmailDetail';
import EngineeringManagerLanding from 'pages/EngineeringManagerLanding';
import FocusedInbox from 'pages/FocusedInbox';
import ForgotPassword from 'pages/ForgotPassword';
import Help from 'pages/Help';
import HelpArticle from 'pages/HelpArticle';
import Inbox from 'pages/Inbox';
import Landing from 'pages/Landing';
import Login from 'pages/Login';
import NotFound from 'pages/NotFound';
import PrivacyPolicy from 'pages/PrivacyPolicy';
import ProductManagerLanding from 'pages/ProductManagerLanding';
import ResetPassword from 'pages/ResetPassword';
import Search from 'pages/Search';
import Settings from 'pages/Settings';
import SetupPassword from 'pages/SetupPassword';
import Stats from 'pages/Stats';
import TermsOfUse from 'pages/TermsOfUse';
import { store } from 'store/store';

interface OnboardingStatus {
  hasCompletedOnboarding: boolean;
  needsTermsAcceptance: boolean;
  needsPrivacyAcceptance: boolean;
}

const PrivateRouteLoading: React.FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
    }}
  >
    Loading...
  </div>
);

interface PrivateRouteContentProps {
  children: React.ReactNode;
  onboardingStatus: OnboardingStatus | null;
  refreshUser: () => Promise<void>;
  setOnboardingStatus: (status: OnboardingStatus) => void;
}

const PrivateRouteContent: React.FC<PrivateRouteContentProps> = ({
  children,
  onboardingStatus,
  refreshUser,
  setOnboardingStatus,
}) => {
  if (onboardingStatus && !onboardingStatus.hasCompletedOnboarding) {
    return (
      <SetupWizard
        onComplete={async () => {
          const response = await axios.get(`${API_URL}/onboarding/status`);
          setOnboardingStatus(response.data);
        }}
        refreshUser={refreshUser}
      />
    );
  }

  const needsConsent =
    onboardingStatus && (onboardingStatus.needsTermsAcceptance || onboardingStatus.needsPrivacyAcceptance);

  if (needsConsent && onboardingStatus) {
    return (
      <>
        {children}
        <ConsentModal
          needsTermsAcceptance={onboardingStatus.needsTermsAcceptance}
          needsPrivacyAcceptance={onboardingStatus.needsPrivacyAcceptance}
          onAccept={async () => {
            await refreshUser();
            const response = await axios.get(`${API_URL}/onboarding/status`);
            setOnboardingStatus(response.data);
          }}
        />
      </>
    );
  }

  return <>{children}</>;
};

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, refreshUser } = useAuth();
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const hasCheckedStatusRef = React.useRef(false);

  useEffect(() => {
    if (!loading && user && !hasCheckedStatusRef.current) {
      hasCheckedStatusRef.current = true;
      axios
        .get(`${API_URL}/onboarding/status`)
        .then(response => {
          setOnboardingStatus(response.data);
        })
        .catch(error => {
          console.error('Failed to check onboarding status:', error);
        })
        .finally(() => {
          setCheckingStatus(false);
        });
    } else if (!loading && !user) {
      hasCheckedStatusRef.current = false;
      setCheckingStatus(false);
    }
  }, [loading, user]);

  if (loading || checkingStatus) {
    return <PrivateRouteLoading />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <PrivateRouteContent
      onboardingStatus={onboardingStatus}
      refreshUser={refreshUser}
      setOnboardingStatus={setOnboardingStatus}
    >
      {children}
    </PrivateRouteContent>
  );
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <PrivateRouteLoading />;
  }

  return user?.isAdmin ? <>{children}</> : <Navigate to="/inbox" />;
};

const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/for/engineering-managers" element={<EngineeringManagerLanding />} />
    <Route path="/for/product-managers" element={<ProductManagerLanding />} />
    <Route path="/login" element={<Login />} />
    <Route path="/auth-error" element={<AuthError />} />
    <Route path="/setup-password" element={<SetupPassword />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/accept-invite/:token" element={<AcceptInvite />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
    <Route path="/terms" element={<TermsOfUse />} />
    <Route
      path="/inbox"
      element={
        <PrivateRoute>
          <Inbox />
        </PrivateRoute>
      }
    />
    <Route
      path="/inbox/:mode"
      element={
        <PrivateRoute>
          <Inbox />
        </PrivateRoute>
      }
    />
    <Route
      path="/inbox/:mode/:threadId"
      element={
        <PrivateRoute>
          <Inbox />
        </PrivateRoute>
      }
    />
    <Route
      path="/focused-inbox/:mode"
      element={
        <PrivateRoute>
          <FocusedInbox />
        </PrivateRoute>
      }
    />
    <Route
      path="/focused-inbox/:mode/:threadId"
      element={
        <PrivateRoute>
          <FocusedInbox />
        </PrivateRoute>
      }
    />
    <Route
      path="/email/:id"
      element={
        <PrivateRoute>
          <EmailDetail />
        </PrivateRoute>
      }
    />
    <Route
      path="/settings"
      element={
        <PrivateRoute>
          <Settings />
        </PrivateRoute>
      }
    />
    <Route
      path="/search"
      element={
        <PrivateRoute>
          <Search />
        </PrivateRoute>
      }
    />
    <Route path="/contacts" element={<Navigate to="/crm/contacts" />} />
    <Route
      path="/crm/contacts"
      element={
        <PrivateRoute>
          <Contacts />
        </PrivateRoute>
      }
    />
    <Route
      path="/crm/contacts/:contactId"
      element={
        <PrivateRoute>
          <ContactDetail />
        </PrivateRoute>
      }
    />
    <Route
      path="/crm/contact-groups"
      element={
        <PrivateRoute>
          <ContactGroups />
        </PrivateRoute>
      }
    />
    <Route
      path="/crm/deals"
      element={
        <PrivateRoute>
          <Deals />
        </PrivateRoute>
      }
    />
    <Route
      path="/stats"
      element={
        <PrivateRoute>
          <Stats />
        </PrivateRoute>
      }
    />
    <Route path="/scheduled" element={<Navigate to="/inbox/scheduled" replace />} />
    <Route
      path="/compose"
      element={
        <PrivateRoute>
          <Compose />
        </PrivateRoute>
      }
    />
    <Route
      path="/help"
      element={
        <PrivateRoute>
          <Help />
        </PrivateRoute>
      }
    />
    <Route
      path="/help/:articleId"
      element={
        <PrivateRoute>
          <HelpArticle />
        </PrivateRoute>
      }
    />
    <Route
      path="/admin"
      element={
        <AdminRoute>
          <AdminDashboard />
        </AdminRoute>
      }
    />
    <Route path="/book/:userId" element={<BookingPage />} />
    <Route path="/booking/:token/reschedule" element={<BookingReschedulePage />} />
    <Route path="/booking/:token/cancel" element={<BookingCancelPage />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

function App() {
  return (
    <Provider store={store}>
      <QueryProvider>
        <AuthProvider>
          <NotificationProvider>
            <Router>
              <AdminMfaProvider>
                <div
                  className="App"
                  style={{
                    backgroundColor: theme.colors.background.default,
                    minHeight: '100vh',
                    fontFamily: theme.typography.fontFamily,
                  }}
                >
                  {/* Needs the Router for its "View plans" navigation. */}
                  <AiLimitBanner />
                  <AppRoutes />
                </div>
              </AdminMfaProvider>
            </Router>
          </NotificationProvider>
        </AuthProvider>
      </QueryProvider>
    </Provider>
  );
}

export default App;
