import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ConsentModal } from './components/ConsentModal';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Inbox from './pages/Inbox';
import EmailDetail from './pages/EmailDetail';
import Settings from './pages/Settings';
import BookingPage from './pages/BookingPage';
import AdminDashboard from './pages/AdminDashboard';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfUse from './pages/TermsOfUse';
import Search from './pages/Search';
import axios from 'axios';
import './App.css';
import { theme } from './theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, refreshUser } = useAuth();
  const [consentStatus, setConsentStatus] = useState<{
    needsTermsAcceptance: boolean;
    needsPrivacyAcceptance: boolean;
  } | null>(null);
  const [checkingConsent, setCheckingConsent] = useState(true);

  useEffect(() => {
    if (!loading && user) {
      // Check consent status
      axios.get(`${API_URL}/users/consent-status`)
        .then((response) => {
          setConsentStatus(response.data);
        })
        .catch((error) => {
          console.error('Failed to check consent status:', error);
        })
        .finally(() => {
          setCheckingConsent(false);
        });
    } else if (!loading && !user) {
      setCheckingConsent(false);
    }
  }, [loading, user]);

  if (loading || checkingConsent) {
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

  // Check if consent is needed
  const needsConsent = consentStatus && 
    (consentStatus.needsTermsAcceptance || consentStatus.needsPrivacyAcceptance);

  if (needsConsent && consentStatus) {
    return (
      <>
        {children}
        <ConsentModal
          needsTermsAcceptance={consentStatus.needsTermsAcceptance}
          needsPrivacyAcceptance={consentStatus.needsPrivacyAcceptance}
          onAccept={async () => {
            await refreshUser();
            // Re-check consent status
            const response = await axios.get(`${API_URL}/users/consent-status`);
            setConsentStatus(response.data);
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
    <AuthProvider>
      <Router>
        <div className="App" style={{ 
          backgroundColor: theme.colors.background.default,
          minHeight: '100vh',
          fontFamily: theme.typography.fontFamily,
        }}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
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
    </AuthProvider>
  );
}

export default App;
