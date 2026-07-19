import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import { HTTP_PAYMENT_REQUIRED, HTTP_UNAUTHORIZED } from 'constants/numbers';
import { AI_VOLUME_LIMIT_REACHED_CODE, API_ENDPOINT_USERS_ME, HTTP_METHOD_GET } from 'constants/strings';

import { registerAiLimitNotifier, resetInterceptorsForTesting, setupAxiosInterceptors } from './axios-interceptors';

describe('axios-interceptors', () => {
  let mockLogout: jest.Mock;
  // The response interceptor is the only one registered; its handlers are:
  // [0] = success handler, [1] = error handler
  type ResponseInterceptorHandlers = [
    (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>,
    (err: unknown) => Promise<never>,
  ];
  let responseInterceptor: ResponseInterceptorHandlers;
  let responseUseSpy: jest.SpyInstance;

  beforeEach(() => {
    mockLogout = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Clear any existing interceptors
    axios.interceptors.request.clear();
    axios.interceptors.response.clear();

    // Reset the interceptors setup flag so we can set up fresh interceptors
    resetInterceptorsForTesting();

    // Spy on interceptor registration
    responseUseSpy = vi.spyOn(axios.interceptors.response, 'use');

    setupAxiosInterceptors(mockLogout);

    // Capture the registered response interceptor
    responseInterceptor = responseUseSpy.mock.calls[0] as unknown as ResponseInterceptorHandlers;
  });

  afterEach(() => {
    axios.interceptors.request.clear();
    axios.interceptors.response.clear();
    vi.restoreAllMocks();
  });

  describe('setupAxiosInterceptors', () => {
    it('should only set up interceptors once', () => {
      const callCountBefore = responseUseSpy.mock.calls.length;

      // Call setup again
      setupAxiosInterceptors(mockLogout);

      // Should not add more interceptors
      expect(responseUseSpy.mock.calls.length).toBe(callCountBefore);
    });

    it('should not register a request interceptor (cookies are sent automatically)', () => {
      // Reset and spy on request interceptor registration
      resetInterceptorsForTesting();
      const requestUseSpy = vi.spyOn(axios.interceptors.request, 'use');

      setupAxiosInterceptors(mockLogout);

      // No request interceptor should be registered — JWT travels via HttpOnly cookie
      expect(requestUseSpy).not.toHaveBeenCalled();
    });
  });

  describe('response interceptor', () => {
    it('should pass through successful responses', async () => {
      const response = { data: { success: true } };
      const successHandler = responseInterceptor[0];

      const result = await successHandler(response as AxiosResponse);

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

    it('should skip logout entirely when _skipInterceptor flag is set', async () => {
      // _skipInterceptor is an explicit opt-out (e.g. the logout POST itself
      // uses it) — neither the initial-auth-check special case nor the logout
      // call should run; the error simply rejects.
      const error = {
        response: { status: HTTP_UNAUTHORIZED },
        config: {
          url: '/auth/logout',
          method: 'post',
          _skipInterceptor: true,
        },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('should call logout when 401 is returned for a non-auth-check request', async () => {
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

    it('should notify on every 402 AI-capacity error and still reject', async () => {
      const notifier = vi.fn();
      registerAiLimitNotifier(notifier);
      const error = {
        response: {
          status: HTTP_PAYMENT_REQUIRED,
          data: { code: AI_VOLUME_LIMIT_REACHED_CODE },
        },
        config: { url: '/llm/suggest-replies', method: 'post' },
      };

      const errorHandler = responseInterceptor[1];

      // The rejected promise still propagates so callers' error handling works.
      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(notifier).toHaveBeenCalledTimes(1);
      expect(mockLogout).not.toHaveBeenCalled();

      // Repeat 402s notify again — visibility/re-show throttling is the
      // banner's job (see AiLimitBanner), keeping the interceptor UI-agnostic.
      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(notifier).toHaveBeenCalledTimes(2);
    });

    it('should not notify after the notifier is unregistered', async () => {
      const notifier = vi.fn();
      registerAiLimitNotifier(notifier);
      registerAiLimitNotifier(null);
      const error = {
        response: {
          status: HTTP_PAYMENT_REQUIRED,
          data: { code: AI_VOLUME_LIMIT_REACHED_CODE },
        },
        config: { url: '/llm/suggest-replies', method: 'post' },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(notifier).not.toHaveBeenCalled();
    });

    it('should not notify on a 402 without the AI-capacity code', async () => {
      const notifier = vi.fn();
      registerAiLimitNotifier(notifier);
      const error = {
        response: { status: HTTP_PAYMENT_REQUIRED, data: { code: 'OTHER' } },
        config: { url: '/api/other', method: 'post' },
      };

      const errorHandler = responseInterceptor[1];

      await expect(errorHandler(error)).rejects.toEqual(error);
      expect(notifier).not.toHaveBeenCalled();
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
