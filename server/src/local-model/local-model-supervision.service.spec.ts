import {
  LocalModelSupervisionService,
  nextSupervisionRate,
} from "./local-model-supervision.service";

describe("nextSupervisionRate", () => {
  it("steps down a stage when accuracy is at/above threshold", () => {
    expect(nextSupervisionRate(50, 95, 100)).toBe(25);
    expect(nextSupervisionRate(25, 90, 100)).toBe(10);
  });

  it("floors at the lowest stage when already accurate and lowest", () => {
    expect(nextSupervisionRate(10, 100, 100)).toBe(10);
  });

  it("steps up a stage when accuracy regresses below threshold", () => {
    expect(nextSupervisionRate(10, 80, 100)).toBe(25);
    expect(nextSupervisionRate(25, 50, 100)).toBe(50);
  });

  it("ceils at the highest stage when already inaccurate and highest", () => {
    expect(nextSupervisionRate(50, 10, 100)).toBe(50);
  });

  it("snaps an out-of-band rate to the nearest stage first", () => {
    // 40 snaps to 50; accurate → down to 25.
    expect(nextSupervisionRate(40, 95, 100)).toBe(25);
    // 15 snaps to 10; inaccurate → up to 25.
    expect(nextSupervisionRate(15, 50, 100)).toBe(25);
  });
});

describe("LocalModelSupervisionService", () => {
  function makeService(opts: {
    enabledEnv?: string;
    existingRow?: { sampleRatePercent: number } | null;
  }) {
    const findOne = jest.fn().mockResolvedValue(opts.existingRow ?? null);
    const supervisionRepository = { findOne } as never;
    const configService = {
      get: () => opts.enabledEnv,
    } as never;
    const service = new LocalModelSupervisionService(
      supervisionRepository,
      configService,
    );
    return { service, findOne };
  }

  it("is enabled by default (env unset)", () => {
    const { service } = makeService({});
    expect(service.isEnabled).toBe(true);
  });

  it("is disabled only when the env flag is exactly 'false'", () => {
    expect(makeService({ enabledEnv: "false" }).service.isEnabled).toBe(false);
    expect(makeService({ enabledEnv: "true" }).service.isEnabled).toBe(true);
  });

  it("returns the default rate for a category never supervised", async () => {
    const { service } = makeService({ existingRow: null });
    expect(await service.getSampleRatePercent("u1", "Newsletters")).toBe(50);
  });

  it("returns the stored rate for a supervised category", async () => {
    const { service } = makeService({ existingRow: { sampleRatePercent: 10 } });
    expect(await service.getSampleRatePercent("u1", "Newsletters")).toBe(10);
  });

  it("returns 0 (no supervision) when disabled", async () => {
    const { service, findOne } = makeService({
      enabledEnv: "false",
      existingRow: { sampleRatePercent: 50 },
    });
    expect(await service.getSampleRatePercent("u1", "Newsletters")).toBe(0);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("returns 0 for an empty category name", async () => {
    const { service, findOne } = makeService({});
    expect(await service.getSampleRatePercent("u1", "")).toBe(0);
    expect(findOne).not.toHaveBeenCalled();
  });
});
