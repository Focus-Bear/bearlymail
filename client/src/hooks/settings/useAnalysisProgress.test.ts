import { act, renderHook } from '@testing-library/react';
import axios from 'axios';

import { useAnalysisProgress } from './useAnalysisProgress';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const OLD_ANALYSIS_ID = 'old-unfinished-signup-run';
const NEW_ANALYSIS_ID = 'fresh-onboarding-run';
const RESUME_URL_SUFFIX = '/context/analyze-progress';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function progressCallIds(): string[] {
  return mockedAxios.get.mock.calls
    .map(([url]) => String(url))
    .filter(url => url.includes('analysisId='))
    .map(url => url.split('analysisId=')[1]);
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useAnalysisProgress — resuming after an unfinished earlier run', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores a late mount-resume result once it has started its own analysis', async () => {
    // The mount check finds the previous sign-up's still-"running" analysis, but
    // its answer lands after POST /context/analyze has superseded that run.
    const resume = deferred<{ data: unknown }>();
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.endsWith(RESUME_URL_SUFFIX)) {
        return resume.promise;
      }
      if (url.includes(`analysisId=${OLD_ANALYSIS_ID}`)) {
        return Promise.resolve({ data: { progress: null, error: { message: 'Superseded by new analysis' } } });
      }
      return Promise.resolve({ data: { progress: { current: 40, total: 100 }, error: null } });
    });
    mockedAxios.post.mockResolvedValue({ data: { analysisId: NEW_ANALYSIS_ID } });

    const { result } = renderHook(() => useAnalysisProgress(undefined, { isNewUserOnboarding: true }));
    await act(async () => {
      await result.current.startAnalysis();
    });
    resume.resolve({ data: { analysisId: OLD_ANALYSIS_ID, progress: { current: 5, total: 100 }, error: null } });
    await flush(5000);

    expect(progressCallIds()).not.toContain(OLD_ANALYSIS_ID);
    expect(progressCallIds()).toContain(NEW_ANALYSIS_ID);
    expect(result.current.analyzeProgress.error).toBeNull();
    expect(result.current.analyzeProgress.progress?.current).toBe(40);
  });

  it('still resumes an in-progress analysis on mount when it has not started one itself', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.endsWith(RESUME_URL_SUFFIX)) {
        return Promise.resolve({
          data: { analysisId: OLD_ANALYSIS_ID, progress: { current: 5, total: 100 }, error: null },
        });
      }
      return Promise.resolve({ data: { progress: { current: 30, total: 100 }, error: null } });
    });

    const { result } = renderHook(() => useAnalysisProgress());
    await flush();

    expect(result.current.analyzing).toBe(true);
    expect(progressCallIds()).toContain(OLD_ANALYSIS_ID);
  });
});

describe('useAnalysisProgress — joining the background onboarding run', () => {
  const ANALYZE_URL_SUFFIX = '/context/analyze';
  const BACKGROUND_ANALYSIS_ID = 'started-at-mailbox-connect';
  const COMPLETE_PERCENT = 100;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { analysisId: BACKGROUND_ANALYSIS_ID } });
    mockedAxios.get.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes('analysisId=')
          ? { progress: { current: COMPLETE_PERCENT, total: COMPLETE_PERCENT }, error: null }
          : { progress: null, error: null },
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the server to attach, and reports an already-finished run as complete', async () => {
    const { result } = renderHook(() => useAnalysisProgress(undefined, { isNewUserOnboarding: true }));
    await act(async () => {
      await result.current.joinOrStartAnalysis();
    });
    await flush(3000);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(ANALYZE_URL_SUFFIX),
      expect.objectContaining({ attachToExisting: true })
    );
    expect(progressCallIds()).toContain(BACKGROUND_ANALYSIS_ID);
    expect(result.current.analyzeProgress.isComplete).toBe(true);
  });

  it('a plain start (retry, Settings) still forces a fresh run', async () => {
    const { result } = renderHook(() => useAnalysisProgress());
    await act(async () => {
      await result.current.startAnalysis();
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(ANALYZE_URL_SUFFIX),
      expect.objectContaining({ attachToExisting: false })
    );
  });
});
