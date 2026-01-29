import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { AuthProvider, useAuth } from 'contexts/AuthContext';
import { NotificationProvider } from 'contexts/NotificationContext';
import { store } from 'store/store';
import { ConsentModal } from 'components/ConsentModal';
import { SetupWizard } from 'components/setup-wizard';
import Landing from 'pages/Landing';
import Login from 'pages/Login';
import Inbox from 'pages/Inbox';
import FocusedInbox from 'pages/FocusedInbox';
import EmailDetail from 'pages/EmailDetail';
import Settings from 'pages/Settings';
import BookingPage from 'pages/BookingPage';
import AdminDashboard from 'pages/AdminDashboard';
import PrivacyPolicy from 'pages/PrivacyPolicy';
import TermsOfUse from 'pages/TermsOfUse';
import Search from 'pages/Search';
import Compose from 'pages/Compose';
import Contacts from 'pages/Contacts';
import SetupPassword from 'pages/SetupPassword';
import AuthError from 'pages/AuthError';
import Help from 'pages/Help';
import HelpArticle from 'pages/HelpArticle';
import axios from 'axios';
import './i18n'; // Initialize i18n
import './App.css';
import { theme } from 'theme/theme';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface OnboardingStatus {
  hasCompletedOnboarding: boolean;
  needsTermsAcceptance: boolean;
  needsPrivacyAcceptance: boolean;
}

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, refreshUser } = useAuth();
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const hasCheckedStatusRef = React.useRef(false);

  useEffect(() => {
    if (!loading && user && !hasCheckedStatusRef.current) {
      hasCheckedStatusRef.current = true;
      axios.get(`${API_URL}/onboarding/status`)
        .then((response) => {
          setOnboardingStatus(response.data);
        })
        .catch((error) => {
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
    return <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      backgroundColor: theme.colors.background.default 
    }}>Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }

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

  const needsConsent = onboardingStatus && 
    (onboardingStatus.needsTermsAcceptance || onboardingStatus.needsPrivacyAcceptance);

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

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      backgroundColor: theme.colors.background.default 
    }}>Loading...</div>;
  }
  
  return user?.isAdmin ? <>{children}</> : <Navigate to="/inbox" />;
};

function App() {
  return (
    <Provider store={store}>
      <AuthProvider>
        <NotificationProvider>
          <Router>
          <div className="App" style={{ 
            backgroundColor: theme.colors.background.default,
            minHeight: '100vh',
            fontFamily: theme.typography.fontFamily,
          }}>
            <Routes>
              <Route path="/" element={<Landing />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/auth-error" element={<AuthError />} />
                            <Route path="/setup-password" element={<SetupPassword />} />
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
              <Route
                path="/contacts"
                element={
                  <PrivateRoute>
                    <Contacts />
                  </PrivateRoute>
                }
              />
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
            </Routes>
          </div>
        </Router>
        </NotificationProvider>
      </AuthProvider>
    </Provider>
  );
}

export default App;
