import axios from 'axios';

/**
 * Reads NestJS-style `{ message: string | string[] }` from an Axios error body.
 */
export function getAxiosResponseErrorMessage(error: unknown): string | undefined {
  if (!axios.isAxiosError(error) || !error.response?.data) {
    return undefined;
  }
  const data = error.response.data as { message?: string | string[] };
  if (typeof data.message === 'string') {
    return data.message;
  }
  if (Array.isArray(data.message)) {
    return data.message.join(', ');
  }
  return undefined;
}
