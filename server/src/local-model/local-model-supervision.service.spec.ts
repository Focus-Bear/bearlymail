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

describe("LocalModelSupervisionService.recordSample", () => {
  type SupervisionRow = {
    id: string;
    sampleRatePercent: number;
    windowSamples: number;
    windowAgreements: number;
    lifetimeSamples: number;
    lifetimeAgreements: number;
  };

  function makeRecordService(existingRow: SupervisionRow | null) {
    const insert = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockResolvedValue(undefined);
    const findOne = jest.fn().mockResolvedValue(existingRow);
    const txRepo = { findOne, insert, update };
    const transaction = jest.fn(
      async (cb: (tx: { getRepository: () => typeof txRepo }) => unknown) =>
        cb({ getRepository: () => txRepo }),
    );
    const supervisionRepository = {
      manager: { transaction },
    } as never;
    const configService = { get: () => undefined } as never;
    const service = new LocalModelSupervisionService(
      supervisionRepository,
      configService,
    );
    return { service, insert, update };
  }

  it("seeds lifetime counters on the insert branch", async () => {
    const { service, insert } = makeRecordService(null);
    await service.recordSample("u1", "Newsletters", true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        windowSamples: 1,
        windowAgreements: 1,
        lifetimeSamples: 1,
        lifetimeAgreements: 1,
      }),
    );
  });

  it("increments both window and lifetime mid-window", async () => {
    const { service, update } = makeRecordService({
      id: "row-1",
      sampleRatePercent: 50,
      windowSamples: 10,
      windowAgreements: 8,
      lifetimeSamples: 40,
      lifetimeAgreements: 33,
    });
    await service.recordSample("u1", "Newsletters", true);
    expect(update).toHaveBeenCalledWith("row-1", {
      windowSamples: 11,
      windowAgreements: 9,
      lifetimeSamples: 41,
      lifetimeAgreements: 34,
    });
  });

  it("resets window but keeps accumulating lifetime when the window completes", async () => {
    const { service, update } = makeRecordService({
      id: "row-1",
      sampleRatePercent: 50,
      windowSamples: 99,
      windowAgreements: 95,
      lifetimeSamples: 199,
      lifetimeAgreements: 190,
    });
    await service.recordSample("u1", "Newsletters", true);
    expect(update).toHaveBeenCalledWith(
      "row-1",
      expect.objectContaining({
        windowSamples: 0,
        windowAgreements: 0,
        lifetimeSamples: 200,
        lifetimeAgreements: 191,
      }),
    );
  });
});
