import { PRIORITY_RULE_SKIP } from "./priority-rule.constants";

describe("PRIORITY_RULE_SKIP", () => {
  const original = process.env.PRIORITY_RULE_SKIP_ENABLED;
  const originalRate = process.env.PRIORITY_RULE_SHADOW_SAMPLE_RATE;
  afterEach(() => {
    process.env.PRIORITY_RULE_SKIP_ENABLED = original;
    process.env.PRIORITY_RULE_SHADOW_SAMPLE_RATE = originalRate;
  });

  describe("enabled", () => {
    it("is ON by default (unset)", () => {
      delete process.env.PRIORITY_RULE_SKIP_ENABLED;
      expect(PRIORITY_RULE_SKIP.enabled()).toBe(true);
    });

    it("stays on for any value other than 'false'", () => {
      process.env.PRIORITY_RULE_SKIP_ENABLED = "true";
      expect(PRIORITY_RULE_SKIP.enabled()).toBe(true);
    });

    it("is the kill switch when set to 'false'", () => {
      process.env.PRIORITY_RULE_SKIP_ENABLED = "false";
      expect(PRIORITY_RULE_SKIP.enabled()).toBe(false);
    });
  });

  describe("shadowSampleRate", () => {
    it("defaults to 0.1 when unset or invalid", () => {
      delete process.env.PRIORITY_RULE_SHADOW_SAMPLE_RATE;
      expect(PRIORITY_RULE_SKIP.shadowSampleRate()).toBe(0.1);
      process.env.PRIORITY_RULE_SHADOW_SAMPLE_RATE = "nonsense";
      expect(PRIORITY_RULE_SKIP.shadowSampleRate()).toBe(0.1);
    });

    it("honours a valid override in [0,1]", () => {
      process.env.PRIORITY_RULE_SHADOW_SAMPLE_RATE = "0.25";
      expect(PRIORITY_RULE_SKIP.shadowSampleRate()).toBe(0.25);
    });

    it("rejects out-of-range values", () => {
      process.env.PRIORITY_RULE_SHADOW_SAMPLE_RATE = "5";
      expect(PRIORITY_RULE_SKIP.shadowSampleRate()).toBe(0.1);
    });
  });
});
