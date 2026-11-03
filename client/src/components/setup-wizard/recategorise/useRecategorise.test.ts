import { act, renderHook } from '@testing-library/react';
import axios from 'axios';

import { RECATEGORISE_STATUS } from './recategorise';
import { useRecategorise } from './useRecategorise';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const COUNTS = [{ categoryId: null, name: null, count: 0 }];

describe('useRecategorise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: COUNTS });
  });

  it('finishes straight away when the inbox has nothing to re-sort', async () => {
    mockedAxios.post.mockResolvedValue({ data: { batchId: null, queued: 0 } });
    const { result } = renderHook(() => useRecategorise());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe(RECATEGORISE_STATUS.DONE);
    expect(result.current.counts).toEqual(COUNTS);
  });

  it('reports an error when the re-sort cannot be queued', async () => {
    mockedAxios.post.mockRejectedValue(new Error('402'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useRecategorise());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe(RECATEGORISE_STATUS.ERROR);
  });
});
