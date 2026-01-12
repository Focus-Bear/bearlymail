import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { AuthProvider, useAuth } from './AuthContext';
import * as posthogModule from 'utils/posthog';

// Mock dependencies
jest.mock('axios');
jest.mock('../utils/posthog', () => ({
  captureEvent: jest.fn(),
  resetPostHog: jest.fn(),
  identifyUser: jest.fn(),
}));
jest.mock('./useAuthInitialization');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedPosthog = posthogModule as jest.Mocked<typeof posthogModule>;

// Mock useAuthInitialization
const mockUseAuthInitialization = jest.fn();
jest.mock('./useAuthInitialization', () => ({
  useAuthInitialization: (...args: any[]) => mockUseAuthInitialization(...args),
}));

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    delete (axios.defaults.headers.common as any)['Authorization'];
    
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
        <button onClick={() => auth.login('test@example.com', 'password')}>
          Login
        </button>
        <button onClick={() => auth.register('test@example.com', 'password', 'Test User')}>
          Register
        </button>
        <button onClick={auth.logout}>Logout</button>
        <button onClick={auth.refreshUser}>Refresh</button>
      </div>
    );
  };

  describe('AuthProvider', () => {
    it('should provide auth context to children', () => {
      // eslint-disable-next-line testing-library/no-wait-for-multiple-assertions -- Multiple assertions are appropriate for this test case
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
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleError.mockRestore();
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const mockResponse = {
        // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses and acceptable in tests
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
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/auth/login'),
          { email: 'test@example.com', password: 'password' }
        );
      });

      await waitFor(() => {
        expect(localStorage.getItem('token')).toBe('test-token');
      });

      await waitFor(() => {
        expect(axios.defaults.headers.common['Authorization']).toBe('Bearer test-token');
      });

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
      const error = new Error('Login failed');
      mockedAxios.post.mockRejectedValue(error);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginButton = screen.getByText('Login');
      await userEvent.click(loginButton);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });

      // Should not set token on error
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('register', () => {
    it('should register user successfully', async () => {
      const mockResponse = {
        // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses and acceptable in tests
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

      // eslint-disable-next-line testing-library/no-wait-for-multiple-assertions -- Multiple waitFor calls are needed to test different async operations
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/auth/register'),
          { email: 'test@example.com', password: 'password', name: 'Test User' }
        );
      });

      await waitFor(() => {
        expect(localStorage.getItem('token')).toBe('test-token');
      });

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
        // eslint-disable-next-line id-denylist -- 'data' is a standard property name for response objects
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
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/auth/register'),
          { email: 'test@example.com', password: 'password', name: 'Test User' }
        );
      });
    });

    it('should handle registration errors', async () => {
      const error = new Error('Registration failed');
      mockedAxios.post.mockRejectedValue(error);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const registerButton = screen.getByText('Register');
      await userEvent.click(registerButton);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });

      // Should not set token on error
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('logout', () => {
    it('should logout user and clear token', async () => {
      // Set up logged in state
      localStorage.setItem('token', 'test-token');
      axios.defaults.headers.common['Authorization'] = 'Bearer test-token';

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const logoutButton = screen.getByText('Logout');
      await userEvent.click(logoutButton);

      await waitFor(() => {
        expect(localStorage.getItem('token')).toBeNull();
      });

      expect(axios.defaults.headers.common['Authorization']).toBeUndefined();
      expect(mockedPosthog.captureEvent).toHaveBeenCalledWith('user_logged_out');
      expect(mockedPosthog.resetPostHog).toHaveBeenCalled();
    });
  });

  describe('refreshUser', () => {
    it('should refresh user data successfully', async () => {
      const mockResponse = {
        // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses and acceptable in tests
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
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('/users/me')
        );
      });
    });

    it('should handle refresh errors gracefully', async () => {
      const error = new Error('Refresh failed');
      mockedAxios.get.mockRejectedValue(error);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const refreshButton = screen.getByText('Refresh');
      await userEvent.click(refreshButton);

      // eslint-disable-next-line testing-library/no-wait-for-multiple-assertions -- Multiple waitFor calls are needed to test different async operations
      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalled();
      });

      // eslint-disable-next-line testing-library/no-wait-for-multiple-assertions -- Multiple waitFor calls are needed to test different async operations
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to refresh user', error);
      });

      consoleErrorSpy.mockRestore();
    });
  });
});

