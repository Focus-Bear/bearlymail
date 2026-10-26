import { sampleEvenly } from "./even-sample.helper";

describe("sampleEvenly", () => {
  it("returns everything when within the limit", () => {
    expect(sampleEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it("spreads the sample across the whole range, keeping order", () => {
    const days = Array.from({ length: 60 }, (_, day) => day);
    const sample = sampleEvenly(days, 6);
    expect(sample).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it("includes the oldest items rather than only the newest", () => {
    const items = Array.from({ length: 3000 }, (_, index) => index);
    const sample = sampleEvenly(items, 600);
    expect(sample).toHaveLength(600);
    expect(sample[0]).toBe(0);
    expect(sample[sample.length - 1]).toBeGreaterThanOrEqual(2990);
  });

  it("returns nothing for a non-positive limit", () => {
    expect(sampleEvenly([1, 2, 3], 0)).toEqual([]);
  });
});
