import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Inbox from './pages/Inbox';
import EmailDetail from './pages/EmailDetail';
import Settings from './pages/Settings';
import BookingPage from './pages/BookingPage';
import './App.css';
import { theme } from './theme/theme';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
  
  return user ? <>{children}</> : <Navigate to="/login" />;
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
            <Route path="/login" element={<Login />} />
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
            <Route path="/book/:userId" element={<BookingPage />} />
            <Route path="/" element={<Navigate to="/inbox" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
