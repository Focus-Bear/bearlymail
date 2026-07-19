import {
  appendThroughputSample,
  estimateRemainingMs,
  formatEtaMinutes,
  MAX_ETA_SAMPLES,
  MIN_ETA_ELAPSED_MS,
  MIN_ETA_SAMPLES,
  ThroughputSample,
} from './recategorizeEta';

const sample = (timestampMs: number, processed: number): ThroughputSample => ({ timestampMs, processed });

describe('estimateRemainingMs', () => {
  it('returns null until there are enough samples', () => {
    const samples = [sample(0, 0), sample(5000, 5)];
    expect(samples.length).toBeLessThan(MIN_ETA_SAMPLES);
    expect(estimateRemainingMs(samples, 10)).toBeNull();
  });

  it('returns null when not enough time has elapsed', () => {
    const samples = [sample(0, 0), sample(1000, 2), sample(MIN_ETA_ELAPSED_MS - 1, 4)];
    expect(estimateRemainingMs(samples, 10)).toBeNull();
  });

  it('returns null when no forward progress has been observed (stalled queue)', () => {
    const samples = [sample(0, 5), sample(5000, 5), sample(10_000, 5)];
    expect(estimateRemainingMs(samples, 10)).toBeNull();
  });

  it('returns null when nothing is pending', () => {
    const samples = [sample(0, 0), sample(5000, 5), sample(10_000, 10)];
    expect(estimateRemainingMs(samples, 0)).toBeNull();
  });

  it('estimates remaining time from steady observed throughput', () => {
    // 10 jobs processed over 20s → 0.5 jobs/s → 30 pending take 60s
    const samples = [sample(0, 0), sample(10_000, 5), sample(20_000, 10)];
    expect(estimateRemainingMs(samples, 30)).toBe(60_000);
  });

  it('uses the sample window edges, tolerating uneven poll intervals', () => {
    // 6 jobs over 12s → 0.5 jobs/s → 6 pending take 12s
    const samples = [sample(2000, 4), sample(5000, 5), sample(9000, 8), sample(14_000, 10)];
    expect(estimateRemainingMs(samples, 6)).toBe(12_000);
  });
});

describe('appendThroughputSample', () => {
  it('appends and preserves order', () => {
    const result = appendThroughputSample([sample(0, 0)], sample(1000, 2));
    expect(result).toEqual([sample(0, 0), sample(1000, 2)]);
  });

  it('caps the window at MAX_ETA_SAMPLES, dropping the oldest entries', () => {
    let samples: ThroughputSample[] = [];
    for (let i = 0; i < MAX_ETA_SAMPLES + 5; i++) {
      samples = appendThroughputSample(samples, sample(i * 1000, i));
    }
    expect(samples).toHaveLength(MAX_ETA_SAMPLES);
    expect(samples[0]).toEqual(sample(5000, 5));
    expect(samples[samples.length - 1]).toEqual(sample((MAX_ETA_SAMPLES + 4) * 1000, MAX_ETA_SAMPLES + 4));
  });
});

describe('formatEtaMinutes', () => {
  it('rounds up to whole minutes', () => {
    expect(formatEtaMinutes(61_000)).toBe(2);
    expect(formatEtaMinutes(120_000)).toBe(2);
    expect(formatEtaMinutes(121_000)).toBe(3);
  });

  it('never shows less than one minute', () => {
    expect(formatEtaMinutes(0)).toBe(1);
    expect(formatEtaMinutes(45_000)).toBe(1);
  });
});
