import axios from 'axios';

/**
 * Reads NestJS-style `{ message: string | string[] }` from an Axios error body.
 */
export function getAxiosResponseErrorMessage(error: unknown): string | undefined {
  if (!axios.isAxiosError(error) || !error.response?.data) {
    return undefined;
  }
  const responseData = error.response.data as { message?: string | string[] };
  if (typeof responseData.message === 'string') {
    return responseData.message;
  }
  if (Array.isArray(responseData.message)) {
    return responseData.message.join(', ');
  }
  return undefined;
}
