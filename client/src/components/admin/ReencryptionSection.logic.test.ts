import { describe, expect, it } from 'vitest';

import { realRunForce, shouldEnableRealRun } from './ReencryptionSection';

interface HealthLike {
  rowsNeedingRemediation: number;
  neverVisitedUsers: number;
}

function health(over: Partial<HealthLike> = {}): HealthLike {
  return {
    rowsNeedingRemediation: 0,
    neverVisitedUsers: 0,
    ...over,
  };
}

describe('shouldEnableRealRun', () => {
  it('disables while health is still loading (null) to prevent premature runs without force', () => {
    expect(shouldEnableRealRun(null)).toBe(false);
  });

  it('enables when there are plaintext-at-rest rows to remediate', () => {
    expect(
      shouldEnableRealRun(
        health({ rowsNeedingRemediation: 5 }) as never,
      ),
    ).toBe(true);
  });

  it('enables when there are never-visited users (normal forward migration)', () => {
    expect(
      shouldEnableRealRun(health({ neverVisitedUsers: 3 }) as never),
    ).toBe(true);
  });

  it('disables when the data is clean AND every user has been visited', () => {
    expect(shouldEnableRealRun(health() as never)).toBe(false);
  });
});

describe('realRunForce', () => {
  it('forces a rescan only when plaintext-at-rest rows exist', () => {
    expect(realRunForce(health({ rowsNeedingRemediation: 1 }) as never)).toBe(
      true,
    );
  });

  it('does NOT force when the only work is never-visited users', () => {
    expect(realRunForce(health({ neverVisitedUsers: 9 }) as never)).toBe(false);
  });

  it('does not force when health is unknown (null)', () => {
    expect(realRunForce(null)).toBe(false);
  });
});
