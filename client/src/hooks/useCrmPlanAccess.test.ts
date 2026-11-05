import { renderHook } from '@testing-library/react';
import { useVolumeUsage } from 'queries/useOrgUsage';

import { useCrmPlanAccess } from './useCrmPlanAccess';

vi.mock('queries/useOrgUsage', () => ({ useVolumeUsage: vi.fn() }));

const givenUsage = (result: { data?: { includesCrm?: boolean }; isLoading: boolean }) =>
  vi.mocked(useVolumeUsage).mockReturnValue(result as unknown as ReturnType<typeof useVolumeUsage>);

describe('useCrmPlanAccess', () => {
  it('reports the CRM as excluded only when the server says so', () => {
    givenUsage({ data: { includesCrm: false }, isLoading: false });
    expect(renderHook(() => useCrmPlanAccess()).result.current).toEqual({
      isCrmIncluded: false,
      isPlanLoading: false,
    });
  });

  it('reports the CRM as included on a plan that has it', () => {
    givenUsage({ data: { includesCrm: true }, isLoading: false });
    expect(renderHook(() => useCrmPlanAccess()).result.current.isCrmIncluded).toBe(true);
  });

  it('leaves the decision to the server when usage failed to load', () => {
    givenUsage({ data: undefined, isLoading: false });
    expect(renderHook(() => useCrmPlanAccess()).result.current.isCrmIncluded).toBe(true);
  });

  it('reports loading until usage arrives', () => {
    givenUsage({ data: undefined, isLoading: true });
    expect(renderHook(() => useCrmPlanAccess()).result.current.isPlanLoading).toBe(true);
  });
});
