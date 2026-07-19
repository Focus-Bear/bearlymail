import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { DebugConfig } from "../database/entities/debug-config.entity";
import { DebugData } from "../database/entities/debug-data.entity";
import { DebugService } from "./debug.service";
import { DEBUG_FEATURES } from "./debug-feature-names";

const FEATURE = DEBUG_FEATURES.PRIORITY_ANALYSIS_TRACKING;

function makeDebugConfigRepo(
  overrides: Partial<jest.Mocked<Repository<DebugConfig>>> = {},
): jest.Mocked<Repository<DebugConfig>> {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  } as unknown as jest.Mocked<Repository<DebugConfig>>;
}

function makeDebugDataRepo(
  overrides: Partial<jest.Mocked<Repository<DebugData>>> = {},
): jest.Mocked<Repository<DebugData>> {
  return {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    manager: { query: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as jest.Mocked<Repository<DebugData>>;
}

async function buildService(
  configRepo: jest.Mocked<Repository<DebugConfig>>,
  dataRepo: jest.Mocked<Repository<DebugData>>,
): Promise<DebugService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DebugService,
      { provide: getRepositoryToken(DebugConfig), useValue: configRepo },
      { provide: getRepositoryToken(DebugData), useValue: dataRepo },
    ],
  }).compile();
  return module.get<DebugService>(DebugService);
}

describe("DebugService", () => {
  // ─── isEnabled() cache behaviour ────────────────────────────────────────────

  describe("isEnabled()", () => {
    it("returns false when no config row exists", async () => {
      const configRepo = makeDebugConfigRepo({
        findOne: jest.fn().mockResolvedValue(null),
      });
      const service = await buildService(configRepo, makeDebugDataRepo());

      const result = await service.isEnabled(FEATURE);
      expect(result).toBe(false);
    });

    it("cache hit — does not re-query DB on second call", async () => {
      const configRepo = makeDebugConfigRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ feature: FEATURE, enabled: true }),
      });
      const service = await buildService(configRepo, makeDebugDataRepo());

      await service.isEnabled(FEATURE);
      await service.isEnabled(FEATURE);

      expect(configRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it("cache miss after invalidation — re-queries DB", async () => {
      const configRepo = makeDebugConfigRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ feature: FEATURE, enabled: true }),
      });
      const service = await buildService(configRepo, makeDebugDataRepo());

      await service.isEnabled(FEATURE);
      // Simulate cache invalidation via setEnabled
      await service.setEnabled(FEATURE, false);
      await service.isEnabled(FEATURE);

      expect(configRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  // ─── log() behaviour ─────────────────────────────────────────────────────────

  describe("log()", () => {
    it("is a no-op when feature is disabled", async () => {
      const configRepo = makeDebugConfigRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ feature: FEATURE, enabled: false }),
      });
      const dataRepo = makeDebugDataRepo();
      const service = await buildService(configRepo, dataRepo);

      await service.log(FEATURE, "user-1", { foo: "bar" });

      expect(dataRepo.save).not.toHaveBeenCalled();
    });

    it("saves a row when feature is enabled", async () => {
      const configRepo = makeDebugConfigRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ feature: FEATURE, enabled: true }),
      });
      const dataRepo = makeDebugDataRepo();
      const service = await buildService(configRepo, dataRepo);

      await service.log(FEATURE, "user-1", { foo: "bar" });

      expect(dataRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─── logBatch() behaviour ────────────────────────────────────────────────────

  describe("logBatch()", () => {
    it("is a no-op when feature is disabled", async () => {
      const configRepo = makeDebugConfigRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ feature: FEATURE, enabled: false }),
      });
      const dataRepo = makeDebugDataRepo();
      const service = await buildService(configRepo, dataRepo);

      await service.logBatch(FEATURE, "user-1", [{ a: 1 }, { b: 2 }]);

      expect(dataRepo.save).not.toHaveBeenCalled();
    });

    it("saves all items in a single save() call when enabled", async () => {
      const configRepo = makeDebugConfigRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ feature: FEATURE, enabled: true }),
      });
      const dataRepo = makeDebugDataRepo();
      const service = await buildService(configRepo, dataRepo);

      await service.logBatch(FEATURE, "user-1", [{ a: 1 }, { b: 2 }]);

      expect(dataRepo.save).toHaveBeenCalledTimes(1);
      const savedArg = (dataRepo.save as jest.Mock).mock.calls[0][0];
      expect(savedArg).toHaveLength(2);
    });

    it("is a no-op when dataItems array is empty", async () => {
      const configRepo = makeDebugConfigRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ feature: FEATURE, enabled: true }),
      });
      const dataRepo = makeDebugDataRepo();
      const service = await buildService(configRepo, dataRepo);

      await service.logBatch(FEATURE, "user-1", []);

      expect(dataRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── setEnabled() / cache invalidation ──────────────────────────────────────

  describe("setEnabled()", () => {
    it("invalidates the in-memory cache so next isEnabled() re-queries DB", async () => {
      const findOne = jest
        .fn()
        .mockResolvedValueOnce({ feature: FEATURE, enabled: true })
        .mockResolvedValueOnce({ feature: FEATURE, enabled: false });
      const configRepo = makeDebugConfigRepo({ findOne });
      const service = await buildService(configRepo, makeDebugDataRepo());

      expect(await service.isEnabled(FEATURE)).toBe(true);
      await service.setEnabled(FEATURE, false);
      expect(await service.isEnabled(FEATURE)).toBe(false);

      expect(findOne).toHaveBeenCalledTimes(2);
    });
  });

  // ─── cleanupExpiredData() cutoff date ───────────────────────────────────────

  describe("cleanupExpiredData()", () => {
    it("deletes rows older than retentionDays days for each feature", async () => {
      const now = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(now);

      const configs: Partial<DebugConfig>[] = [
        { feature: "feat_a", retentionDays: 7 },
        { feature: "feat_b", retentionDays: 30 },
      ];
      const configRepo = makeDebugConfigRepo({
        find: jest.fn().mockResolvedValue(configs),
      });
      const dataRepo = makeDebugDataRepo({
        delete: jest
          .fn()
          .mockResolvedValueOnce({ affected: 3 })
          .mockResolvedValueOnce({ affected: 5 }),
      });
      const service = await buildService(configRepo, dataRepo);

      const total = await service.cleanupExpiredData();

      expect(total).toBe(8);
      expect(dataRepo.delete).toHaveBeenCalledTimes(2);

      // Verify the cutoff for feat_a (7 days)
      const firstCall = (dataRepo.delete as jest.Mock).mock.calls[0][0];
      const expectedCutoffA = new Date(now - 7 * 24 * 60 * 60 * 1000);
      expect(firstCall.feature).toBe("feat_a");
      expect(firstCall.createdAt.value).toEqual(expectedCutoffA);

      jest.spyOn(Date, "now").mockRestore();
    });

    it("returns 0 when no configs exist", async () => {
      const configRepo = makeDebugConfigRepo({
        find: jest.fn().mockResolvedValue([]),
      });
      const service = await buildService(configRepo, makeDebugDataRepo());
      const total = await service.cleanupExpiredData();
      expect(total).toBe(0);
    });
  });

  // ─── updateDebugConfig() — single round-trip ─────────────────────────────────

  describe("updateDebugConfig()", () => {
    it("calls update once when both enabled and retentionDays are provided", async () => {
      const configRepo = makeDebugConfigRepo();
      const service = await buildService(configRepo, makeDebugDataRepo());

      await service.updateDebugConfig(FEATURE, {
        enabled: true,
        retentionDays: 14,
      });

      expect(configRepo.update).toHaveBeenCalledTimes(1);
      expect(configRepo.update).toHaveBeenCalledWith(
        { feature: FEATURE },
        { enabled: true, retentionDays: 14 },
      );
    });

    it("does not call update when no fields are provided", async () => {
      const configRepo = makeDebugConfigRepo();
      const service = await buildService(configRepo, makeDebugDataRepo());

      await service.updateDebugConfig(FEATURE, {});

      expect(configRepo.update).not.toHaveBeenCalled();
    });
  });
});
