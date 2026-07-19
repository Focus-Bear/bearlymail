import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import * as posthogModule from 'utils/posthog';

import { AuthProvider, useAuth } from './AuthContext';

// Mock dependencies
vi.mock('axios');
vi.mock('../utils/posthog', () => ({
  captureEvent: vi.fn(),
  resetPostHog: vi.fn(),
  identifyUser: vi.fn(),
}));
vi.mock('./useAuthInitialization');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedPosthog = posthogModule as jest.Mocked<typeof posthogModule>;

// Mock useAuthInitialization
const mockUseAuthInitialization = vi.fn();
vi.mock('./useAuthInitialization', () => ({
  useAuthInitialization: (...args: unknown[]) => mockUseAuthInitialization(...args),
}));

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete (axios.defaults.headers.common as Record<string, unknown>)['Authorization'];

    // Setup default mock for useAuthInitialization
    mockUseAuthInitialization.mockImplementation((setUser, setLoading) => {
      React.useEffect(() => {
        setLoading(false);
      }, [setLoading]);
    });
  });

  const TestComponent: React.FC = () => {
    const auth = useAuth();
    return (
      <div>
        <div data-testid="user">{auth.user ? auth.user.email : 'null'}</div>
        <div data-testid="loading">{auth.loading ? 'loading' : 'not-loading'}</div>
        <button onClick={() => auth.login('test@example.com', 'password')}>Login</button>
        <button onClick={() => auth.register('test@example.com', 'password', 'Test User')}>Register</button>
        <button onClick={() => auth.logout()}>Logout</button>
        <button onClick={auth.refreshUser}>Refresh</button>
      </div>
    );
  };

  describe('AuthProvider', () => {
    it('should provide auth context to children', () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByTestId('user')).toBeInTheDocument();
      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    it('should throw error when useAuth is used outside provider', () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleError.mockRestore();
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const mockResponse = {
        data: {
          access_token: 'test-token',
          user: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
            isAdmin: false,
          },
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginButton = screen.getByText('Login');
      await userEvent.click(loginButton);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), {
          email: 'test@example.com',
          password: 'password',
        });
      });

      // JWT is now stored in an HttpOnly cookie by the server — NOT in localStorage
      expect(localStorage.getItem('token')).toBeNull();
      // No manual Authorization header — cookie is sent automatically via withCredentials
      expect(axios.defaults.headers.common['Authorization']).toBeUndefined();

      await waitFor(() => {
        expect(mockedPosthog.captureEvent).toHaveBeenCalledWith('user_logged_in', {
          method: 'email',
        });
      });

      await waitFor(() => {
        expect(mockedPosthog.identifyUser).toHaveBeenCalledWith('user-123', {
          isAdmin: false,
        });
      });
    });

    it('should handle login errors', async () => {
      mockedAxios.post.mockRejectedValue({ message: 'Login failed' });

      // Create a component that catches the error
      const TestComponentWithErrorHandling: React.FC = () => {
        const auth = useAuth();
        const [loginError, setLoginError] = React.useState<string | null>(null);

        const handleLogin = async () => {
          try {
            await auth.login('test@example.com', 'password');
          } catch {
            setLoginError('error');
          }
        };

        return (
          <div>
            <div data-testid="login-error">{loginError || 'no-error'}</div>
            <button onClick={handleLogin}>Login</button>
          </div>
        );
      };

      render(
        <AuthProvider>
          <TestComponentWithErrorHandling />
        </AuthProvider>
      );

      const loginButton = screen.getByText('Login');
      await userEvent.click(loginButton);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('login-error')).toHaveTextContent('error');
      });

      // Should not set token on error
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('register', () => {
    it('should register user successfully', async () => {
      const mockResponse = {
        data: {
          access_token: 'test-token',
          user: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
            isAdmin: false,
          },
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const registerButton = screen.getByText('Register');
      await userEvent.click(registerButton);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/auth/register'), {
          email: 'test@example.com',
          password: 'password',
          name: 'Test User',
        });
      });

      // JWT is set in an HttpOnly cookie by the server — NOT in localStorage
      expect(localStorage.getItem('token')).toBeNull();

      await waitFor(() => {
        expect(mockedPosthog.captureEvent).toHaveBeenCalledWith('user_registered');
      });

      await waitFor(() => {
        expect(mockedPosthog.identifyUser).toHaveBeenCalledWith('user-123', {
          isAdmin: false,
        });
      });
    });

    it('should register user without name', async () => {
      const mockResponse = {
        data: {
          access_token: 'test-token',
          user: {
            id: 'user-123',
            email: 'test@example.com',
            isAdmin: false,
          },
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const registerButton = screen.getByText('Register');
      await userEvent.click(registerButton);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/auth/register'), {
          email: 'test@example.com',
          password: 'password',
          name: 'Test User',
        });
      });
    });

    it('should handle registration errors', async () => {
      mockedAxios.post.mockRejectedValue({ message: 'Registration failed' });

      // Create a component that catches the error
      const TestComponentWithErrorHandling: React.FC = () => {
        const auth = useAuth();
        const [registerError, setRegisterError] = React.useState<string | null>(null);

        const handleRegister = async () => {
          try {
            await auth.register('test@example.com', 'password', 'Test User');
          } catch {
            setRegisterError('error');
          }
        };

        return (
          <div>
            <div data-testid="register-error">{registerError || 'no-error'}</div>
            <button onClick={handleRegister}>Register</button>
          </div>
        );
      };

      render(
        <AuthProvider>
          <TestComponentWithErrorHandling />
        </AuthProvider>
      );

      const registerButton = screen.getByText('Register');
      await userEvent.click(registerButton);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('register-error')).toHaveTextContent('error');
      });

      // Should not set token on error
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('logout', () => {
    it('should logout user, clear legacy localStorage token, and call server logout', async () => {
      // Set up a legacy localStorage token (simulating a pre-migration session)
      localStorage.setItem('token', 'legacy-token');
      axios.defaults.headers.common['Authorization'] = 'Bearer legacy-token';
      // Logout calls POST /auth/logout to clear the HttpOnly cookie
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const logoutButton = screen.getByText('Logout');
      await userEvent.click(logoutButton);

      // Legacy localStorage token removed
      await waitFor(() => {
        expect(localStorage.getItem('token')).toBeNull();
      });

      // Authorization header cleared
      expect(axios.defaults.headers.common['Authorization']).toBeUndefined();
      expect(mockedPosthog.captureEvent).toHaveBeenCalledWith('user_logged_out');
      expect(mockedPosthog.resetPostHog).toHaveBeenCalled();

      // Server logout called to clear the HttpOnly cookie
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/auth/logout'),
          {},
          expect.objectContaining({ _skipInterceptor: true }),
        );
      });
    });
  });

  describe('refreshUser', () => {
    it('should refresh user data successfully', async () => {
      const mockResponse = {
        data: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Updated Name',
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const refreshButton = screen.getByText('Refresh');
      await userEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/users/me'));
      });
    });

    it('should handle refresh errors gracefully', async () => {
      const error = new Error('Refresh failed');
      mockedAxios.get.mockRejectedValue(error);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const refreshButton = screen.getByText('Refresh');
      await userEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to refresh user', error);
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
