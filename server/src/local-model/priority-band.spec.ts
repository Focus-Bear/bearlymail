import { PRIORITY_SCORES } from "../constants/priority-constants";
import {
  bandMidpointScore,
  PRIORITY_BAND_LOW_MAX,
  PRIORITY_BAND_MED_MAX,
  priorityBand,
} from "./priority-band";

describe("priorityBand", () => {
  it("maps scores to the band the model was trained on", () => {
    expect(priorityBand(0)).toBe("low");
    expect(priorityBand(PRIORITY_BAND_LOW_MAX - 1)).toBe("low");
    expect(priorityBand(PRIORITY_BAND_LOW_MAX)).toBe("med");
    expect(priorityBand(PRIORITY_BAND_MED_MAX - 1)).toBe("med");
    expect(priorityBand(PRIORITY_BAND_MED_MAX)).toBe("high");
    expect(priorityBand(100)).toBe("high");
  });
});

describe("bandMidpointScore", () => {
  it("returns the midpoint of each band's score range", () => {
    // low = (0 + 10) / 2; med = (10 + 35) / 2 = 22.5 -> 23;
    // high = (35 + 100) / 2 = 67.5 -> 68
    expect(bandMidpointScore("low")).toBe(5);
    expect(bandMidpointScore("med")).toBe(23);
    expect(bandMidpointScore("high")).toBe(68);
  });

  it("round-trips: each midpoint maps back to its own band", () => {
    expect(priorityBand(bandMidpointScore("low"))).toBe("low");
    expect(priorityBand(bandMidpointScore("med"))).toBe("med");
    expect(priorityBand(bandMidpointScore("high"))).toBe("high");
  });

  it("keeps the high midpoint below HIGH_THRESHOLD so a band can never trigger emergency delivery", () => {
    expect(bandMidpointScore("high")).toBeLessThan(
      PRIORITY_SCORES.HIGH_THRESHOLD,
    );
  });

  it("returns 0 for an unknown band", () => {
    expect(bandMidpointScore("nonsense")).toBe(0);
  });
});
