import { AUTH_CONSTANTS } from "../constants/auth-constants";
import { isMfaElevationFresh } from "./mfa-elevation";

describe("isMfaElevationFresh", () => {
  it("is true for a just-now elevation", () => {
    expect(isMfaElevationFresh(Date.now())).toBe(true);
  });

  it("is true just inside the recency window", () => {
    const justInside =
      Date.now() - (AUTH_CONSTANTS.MFA_ELEVATION_TTL_MS - 1000);
    expect(isMfaElevationFresh(justInside)).toBe(true);
  });

  it("is false once past the recency window", () => {
    const justOutside =
      Date.now() - (AUTH_CONSTANTS.MFA_ELEVATION_TTL_MS + 1000);
    expect(isMfaElevationFresh(justOutside)).toBe(false);
  });

  it("is false for missing or non-numeric timestamps", () => {
    expect(isMfaElevationFresh(undefined)).toBe(false);
    expect(isMfaElevationFresh(null)).toBe(false);
    expect(isMfaElevationFresh("123")).toBe(false);
    expect(isMfaElevationFresh(NaN)).toBe(false);
  });

  it("is false for a timestamp in the future (clock skew guard)", () => {
    const futureTimestamp = Date.now() + 60_000;
    expect(isMfaElevationFresh(futureTimestamp)).toBe(false);
  });
});
