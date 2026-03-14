import axios from 'axios';

import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { API_ENDPOINT_USERS_ME, HTTP_METHOD_GET } from 'constants/strings';

import { resetInterceptorsForTesting, setupAxiosInterceptors } from './axios-interceptors';

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
  let removeItemSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Set up spies on localStorage
    removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

    mockLogout = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Clear any existing interceptors
    axios.interceptors.request.clear();
    axios.interceptors.response.clear();

    // Reset the interceptors setup flag so we can set up fresh interceptors
    resetInterceptorsForTesting();

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
    jest.restoreAllMocks();
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
      localStorage.setItem('token', token);

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
      localStorage.setItem('token', token);

      const config = {
        headers: {},
        url: '/api/test',
      };

      const result = await requestInterceptor[0](config);

      expect(removeItemSpy).toHaveBeenCalledWith('token');
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should handle invalid token format', async () => {
      localStorage.setItem('token', 'invalid-token');

      const config = {
        headers: {},
        url: '/api/test',
      };

      const result = await requestInterceptor[0](config);

      // Invalid token should be treated as expired
      expect(removeItemSpy).toHaveBeenCalledWith('token');
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should handle token without expiration', async () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ sub: 'user-123' })); // No exp
      const token = `${header}.${payload}.signature`;
      localStorage.setItem('token', token);

      const config = {
        headers: {},
        url: '/api/test',
      };

      const result = await requestInterceptor[0](config);

      // Token without exp is treated as valid (isTokenExpired returns false when no exp)
      expect(result.headers.Authorization).toBe(`Bearer ${token}`);
    });

    it('should handle request interceptor errors', async () => {
      const error = new Error('Request error');
      const errorHandler = requestInterceptor[1];

      await expect(errorHandler(error)).rejects.toThrow('Request error');
    });
  });

  describe('response interceptor', () => {
    it('should pass through successful responses', async () => {
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
      expect(console.log).toHaveBeenCalledWith('Skipping interceptor logout for initial /users/me check');
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('should call logout for /users/me GET request with _skipInterceptor flag', async () => {
      // When _skipInterceptor is true, the request should NOT be treated as an initial auth check
      // So logout SHOULD be called (the flag overrides the special handling)
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
      expect(mockLogout).toHaveBeenCalled();
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
      localStorage.setItem('token', token);

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
      expect(removeItemSpy).toHaveBeenCalledWith('token');
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should logout when 401 with valid token (token revoked)', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createJWT(futureExp);
      localStorage.setItem('token', token);

      const error = {
        response: { status: HTTP_UNAUTHORIZED },
        config: {
          url: '/api/other',
          method: 'post',
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(console.warn).toHaveBeenCalledWith('Got 401 with valid token, clearing and logging out');
      expect(removeItemSpy).toHaveBeenCalledWith('token');
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
