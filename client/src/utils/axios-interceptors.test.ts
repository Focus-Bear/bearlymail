import axios from 'axios';
import { setupAxiosInterceptors } from './axios-interceptors';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { API_ENDPOINT_USERS_ME, HTTP_METHOD_GET } from 'constants/strings';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Helper to create a JWT token with expiration
const createJWT = (exp: number): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'user-123', exp }));
  return `${header}.${payload}.signature`;
};

describe('axios-interceptors', () => {
  let mockLogout: jest.Mock;
  let requestInterceptor: any;
  let responseInterceptor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    mockLogout = jest.fn();
    console.log = jest.fn();
    console.warn = jest.fn();

    // Clear any existing interceptors
    axios.interceptors.request.clear();
    axios.interceptors.response.clear();

    // Spy on interceptor registration
    const requestUseSpy = jest.spyOn(axios.interceptors.request, 'use');
    const responseUseSpy = jest.spyOn(axios.interceptors.response, 'use');

    setupAxiosInterceptors(mockLogout);

    // Capture the interceptors
    requestInterceptor = requestUseSpy.mock.calls[0];
    responseInterceptor = responseUseSpy.mock.calls[0];
  });

  afterEach(() => {
    axios.interceptors.request.clear();
    axios.interceptors.response.clear();
  });

  describe('setupAxiosInterceptors', () => {
    it('should only set up interceptors once', () => {
      const requestUseSpy = jest.spyOn(axios.interceptors.request, 'use');
      const responseUseSpy = jest.spyOn(axios.interceptors.response, 'use');

      // Call setup again
      setupAxiosInterceptors(mockLogout);

      // Should not add more interceptors
      expect(requestUseSpy).toHaveBeenCalledTimes(1);
      expect(responseUseSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('request interceptor', () => {
    it('should add Authorization header for valid token', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const token = createJWT(futureExp);
      localStorageMock.setItem('token', token);

      const config = {
        headers: {},
        url: '/api/test',
      };

      const result = await requestInterceptor[0](config);

      expect(result.headers.Authorization).toBe(`Bearer ${token}`);
    });

    it('should not add Authorization header when no token exists', async () => {
      const config = {
        headers: {},
        url: '/api/test',
      };

      const result = await requestInterceptor[0](config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should remove expired token and not add Authorization header', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const token = createJWT(pastExp);
      localStorageMock.setItem('token', token);

      const config = {
        headers: {},
        url: '/api/test',
      };

      const result = await requestInterceptor[0](config);

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should handle invalid token format', async () => {
      localStorageMock.setItem('token', 'invalid-token');

      const config = {
        headers: {},
        url: '/api/test',
      };

      const result = await requestInterceptor[0](config);

      // Invalid token should be treated as expired
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should handle token without expiration', async () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ sub: 'user-123' })); // No exp
      const token = `${header}.${payload}.signature`;
      localStorageMock.setItem('token', token);

      const config = {
        headers: {},
        url: '/api/test',
      };

      const result = await requestInterceptor[0](config);

      // Token without exp should be treated as expired
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should handle request interceptor errors', async () => {
      const error = new Error('Request error');
      const errorHandler = requestInterceptor[1];

      await expect(errorHandler(error)).rejects.toThrow('Request error');
    });
  });

  describe('response interceptor', () => {
    it('should pass through successful responses', async () => {
      // eslint-disable-next-line id-denylist -- 'data' is a standard property name for response objects
      const response = { data: { success: true } };
      const successHandler = responseInterceptor[0];

      const result = await successHandler(response);

      expect(result).toEqual(response);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('should skip logout for initial /users/me GET request', async () => {
      const error = {
        response: { status: HTTP_UNAUTHORIZED },
        config: {
          url: API_ENDPOINT_USERS_ME,
          method: HTTP_METHOD_GET,
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(console.log).toHaveBeenCalledWith(
        'Skipping interceptor logout for initial /users/me check'
      );
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('should skip logout for /users/me GET request with _skipInterceptor flag', async () => {
      const error = {
        response: { status: HTTP_UNAUTHORIZED },
        config: {
          url: API_ENDPOINT_USERS_ME,
          method: HTTP_METHOD_GET,
          _skipInterceptor: true,
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('should logout when 401 and no token exists', async () => {
      const error = {
        response: { status: HTTP_UNAUTHORIZED },
        config: {
          url: '/api/other',
          method: 'post',
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should logout when 401 and token is expired', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      const token = createJWT(pastExp);
      localStorageMock.setItem('token', token);

      const error = {
        response: { status: HTTP_UNAUTHORIZED },
        config: {
          url: '/api/other',
          method: 'post',
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(console.log).toHaveBeenCalledWith('Token expired (401), logging out');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should logout when 401 with valid token (token revoked)', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createJWT(futureExp);
      localStorageMock.setItem('token', token);

      const error = {
        response: { status: HTTP_UNAUTHORIZED },
        config: {
          url: '/api/other',
          method: 'post',
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(console.warn).toHaveBeenCalledWith(
        'Got 401 with valid token, clearing and logging out'
      );
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should pass through non-401 errors', async () => {
      const error = {
        response: { status: 500 },
        config: {
          url: '/api/other',
          method: 'post',
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('should pass through errors without response', async () => {
      const error = {
        message: 'Network error',
        config: {
          url: '/api/other',
          method: 'post',
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('should handle /users/me in URL path (not just exact match)', async () => {
      const error = {
        response: { status: HTTP_UNAUTHORIZED },
        config: {
          url: `https://api.example.com${API_ENDPOINT_USERS_ME}`,
          method: HTTP_METHOD_GET,
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('should logout for /users/me POST request (not initial auth check)', async () => {
      const error = {
        response: { status: HTTP_UNAUTHORIZED },
        config: {
          url: API_ENDPOINT_USERS_ME,
          method: 'post', // Not GET
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(mockLogout).toHaveBeenCalled();
    });
  });
});

