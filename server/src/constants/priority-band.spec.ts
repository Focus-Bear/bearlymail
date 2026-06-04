import {
  bandToRepresentativeScore,
  PriorityBand,
  scoreToBand,
} from "./priority-band";

describe("priority-band", () => {
  describe("scoreToBand", () => {
    it.each<[number, PriorityBand]>([
      [100, "urgent"],
      [90, "urgent"],
      [89, "high"],
      [75, "high"],
      [74, "medium"],
      [50, "medium"],
      [49, "low"],
      [25, "low"],
      [24, "very_low"],
      [0, "very_low"],
    ])("maps score %i to band %s", (score, band) => {
      expect(scoreToBand(score)).toBe(band);
    });
  });

  describe("bandToRepresentativeScore", () => {
    it("maps each band to its representative score", () => {
      expect(bandToRepresentativeScore("urgent")).toBe(95);
      expect(bandToRepresentativeScore("high")).toBe(80);
      expect(bandToRepresentativeScore("medium")).toBe(50);
      expect(bandToRepresentativeScore("low")).toBe(35);
      expect(bandToRepresentativeScore("very_low")).toBe(15);
    });

    it("every representative score round-trips back to its own band", () => {
      const bands: PriorityBand[] = [
        "urgent",
        "high",
        "medium",
        "low",
        "very_low",
      ];
      for (const band of bands) {
        expect(scoreToBand(bandToRepresentativeScore(band))).toBe(band);
      }
    });
  });
});
