import axios from 'axios';

import { getAxiosResponseErrorMessage } from './axios-error-message';

describe('getAxiosResponseErrorMessage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns undefined for non-axios errors', () => {
    expect(getAxiosResponseErrorMessage(new Error('x'))).toBeUndefined();
  });

  it('reads string message from Nest-style body', () => {
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    const err = { response: { data: { message: 'Google Calendar not connected' } } };
    expect(getAxiosResponseErrorMessage(err)).toBe('Google Calendar not connected');
  });

  it('joins string[] message from validation errors', () => {
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    const err = { response: { data: { message: ['a', 'b'] } } };
    expect(getAxiosResponseErrorMessage(err)).toBe('a, b');
  });
});
