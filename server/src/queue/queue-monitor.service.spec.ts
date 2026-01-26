import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { QueueMonitorService } from "./queue-monitor.service";
import { QUEUE_CONSTANTS } from "../constants/queue-constants";
import * as fs from "fs";
import * as path from "path";

// Mock fs module
jest.mock("fs");
jest.mock("path");

describe("QueueMonitorService", () => {
  let service: QueueMonitorService;
  let dataSource: jest.Mocked<DataSource>;
  let mockBoss: any;

  const mockMetricsLogFile = "/mock/path/logs/queue-metrics.log";

  beforeEach(async () => {
    // Mock path.join
    (path.join as jest.Mock).mockReturnValue(mockMetricsLogFile);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.appendFileSync as jest.Mock).mockReturnValue(undefined);

    mockBoss = {
      on: jest.fn(),
      off: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueMonitorService,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
          },
        },
        {
          provide: "PG_BOSS",
          useValue: mockBoss,
        },
      ],
    }).compile();

    service = module.get<QueueMonitorService>(QueueMonitorService);
    dataSource = module.get(DataSource);
    jest.clearAllMocks();
  });

  describe("trackJobStart", () => {
    it("should track job start time", () => {
      service.trackJobStart("job-1", "sync-emails");

      const stats = service.getProcessingTimeStats("sync-emails");
      // Job is tracked but not complete, so stats should be null
      expect(stats).toBeNull();
    });

    it("should track multiple jobs independently", () => {
      service.trackJobStart("job-1", "sync-emails");
      service.trackJobStart("job-2", "sync-emails");

      // Both jobs started but not complete
      const stats = service.getProcessingTimeStats("sync-emails");
      expect(stats).toBeNull();
    });
  });

  describe("trackJobComplete", () => {
    it("should track job completion and record processing time", () => {
      const startTime = Date.now();
      service["jobStartTimes"].set("sync-emails:job-1", startTime);

      // Wait a bit to simulate processing
      const waitTime = 100;
      jest.advanceTimersByTime(waitTime);

      service.trackJobComplete("job-1", "sync-emails", true);

      const stats = service.getProcessingTimeStats("sync-emails");
      expect(stats).not.toBeNull();
      expect(stats?.count).toBe(1);
      expect(stats?.avg).toBeGreaterThanOrEqual(waitTime);
    });

    it("should track failed jobs", () => {
      const startTime = Date.now();
      service["jobStartTimes"].set("sync-emails:job-1", startTime);

      service.trackJobComplete("job-1", "sync-emails", false);

      const stats = service.getProcessingTimeStats("sync-emails");
      expect(stats).not.toBeNull();
      expect(stats?.count).toBe(1);
    });

    it("should remove job from start times after completion", () => {
      service["jobStartTimes"].set("sync-emails:job-1", Date.now());

      service.trackJobComplete("job-1", "sync-emails", true);

      expect(service["jobStartTimes"].has("sync-emails:job-1")).toBe(false);
    });

    it("should handle job completion without start time gracefully", () => {
      // No start time tracked
      service.trackJobComplete("job-1", "sync-emails", true);

      // Should not throw error
      expect(service["jobStartTimes"].has("sync-emails:job-1")).toBe(false);
    });

    it("should keep only last 1000 processing times per queue", () => {
      const startTime = Date.now();
      for (let i = 0; i < 1001; i++) {
        service["jobStartTimes"].set(`sync-emails:job-${i}`, startTime);
        service.trackJobComplete(`job-${i}`, "sync-emails", true);
      }

      const stats = service.getProcessingTimeStats("sync-emails");
      expect(stats?.count).toBe(1000);
    });
  });

  describe("getProcessingTimeStats", () => {
    it("should return null when no processing times", () => {
      const stats = service.getProcessingTimeStats("sync-emails");

      expect(stats).toBeNull();
    });

    it("should calculate percentile statistics correctly", () => {
      // Add processing times: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      for (let i = 1; i <= 10; i++) {
        const startTime = Date.now() - (11 - i) * 10;
        service["jobStartTimes"].set(`sync-emails:job-${i}`, startTime);
        service.trackJobComplete(`job-${i}`, "sync-emails", true);
      }

      const stats = service.getProcessingTimeStats("sync-emails");

      expect(stats).not.toBeNull();
      expect(stats?.count).toBe(10);
      expect(stats?.avg).toBeCloseTo(55, 0); // Average of 10-100
      expect(stats?.p50).toBe(50); // Median
      expect(stats?.p95).toBe(95); // 95th percentile
      expect(stats?.p99).toBe(99); // 99th percentile
    });

    it("should return correct percentiles for odd number of samples", () => {
      // Add 11 processing times
      for (let i = 1; i <= 11; i++) {
        const startTime = Date.now() - (12 - i) * 10;
        service["jobStartTimes"].set(`sync-emails:job-${i}`, startTime);
        service.trackJobComplete(`job-${i}`, "sync-emails", true);
      }

      const stats = service.getProcessingTimeStats("sync-emails");

      expect(stats?.count).toBe(11);
      expect(stats?.p50).toBe(60); // Median of 11 items
    });
  });

  describe("collectMetrics", () => {
    it("should collect metrics for all queues", async () => {
      const mockQueueResults = [
        {
          pending: "10",
          active: "5",
          completed: "100",
          failed: "2",
        },
      ];

      dataSource.query.mockResolvedValue(mockQueueResults);

      await service.collectMetrics();

      // Should query for each of the 10 queue names
      expect(dataSource.query).toHaveBeenCalledTimes(10);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT"),
        expect.arrayContaining([expect.any(String)]),
      );
    });

    it("should handle queue query errors gracefully", async () => {
      dataSource.query
        .mockRejectedValueOnce(new Error("Database error"))
        .mockResolvedValue([
          {
            pending: "5",
            active: "2",
            completed: "50",
            failed: "1",
          },
        ]);

      await service.collectMetrics();

      // Should continue processing other queues after error
      expect(dataSource.query).toHaveBeenCalledTimes(10);
    });

    it("should calculate totals correctly", async () => {
      const mockResults = {
        pending: "10",
        active: "5",
        completed: "100",
        failed: "2",
      };

      dataSource.query.mockResolvedValue([mockResults]);

      await service.collectMetrics();

      // Should write metrics to file
      expect(fs.appendFileSync).toHaveBeenCalled();
      const logCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      const loggedData = JSON.parse(logCall[1].trim());
      expect(loggedData.totalPending).toBe(100); // 10 queues * 10
      expect(loggedData.totalActive).toBe(50); // 10 queues * 5
    });

    it("should log warning when queue depth is high", async () => {
      const highPendingCount = String(QUEUE_CONSTANTS.MAX_QUEUE_SIZE + 100);
      dataSource.query.mockResolvedValue([
        {
          pending: highPendingCount,
          active: "0",
          completed: "0",
          failed: "0",
        },
      ]);

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      await service.collectMetrics();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("High queue depth"),
      );
      loggerWarnSpy.mockRestore();
    });

    it("should log warning when active jobs are high", async () => {
      // Use a reasonable high value for active jobs test
      const highActiveCount = String(250); // Higher than typical limit
      dataSource.query.mockResolvedValue([
        {
          pending: "0",
          active: highActiveCount,
          completed: "0",
          failed: "0",
        },
      ]);

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      await service.collectMetrics();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("High active jobs"),
      );
      loggerWarnSpy.mockRestore();
    });

    it("should handle file write errors gracefully", async () => {
      dataSource.query.mockResolvedValue([
        {
          pending: "5",
          active: "2",
          completed: "50",
          failed: "1",
        },
      ]);

      (fs.appendFileSync as jest.Mock).mockImplementation(() => {
        throw new Error("File write error");
      });

      const loggerErrorSpy = jest
        .spyOn(service["logger"], "error")
        .mockImplementation();

      await service.collectMetrics();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to write queue metrics to file:",
        expect.any(Error),
      );
      loggerErrorSpy.mockRestore();
    });

    it("should parse string counts correctly", async () => {
      dataSource.query.mockResolvedValue([
        {
          pending: "123",
          active: "45",
          completed: "678",
          failed: "9",
        },
      ]);

      await service.collectMetrics();

      expect(fs.appendFileSync).toHaveBeenCalled();
      const logCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      const loggedData = JSON.parse(logCall[1].trim());
      expect(loggedData.queues[0].pending).toBe(123);
      expect(loggedData.queues[0].active).toBe(45);
    });

    it("should handle missing count fields", async () => {
      dataSource.query.mockResolvedValue([
        {
          pending: null,
          active: undefined,
          completed: "50",
          failed: "",
        },
      ]);

      await service.collectMetrics();

      expect(fs.appendFileSync).toHaveBeenCalled();
      const logCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      const loggedData = JSON.parse(logCall[1].trim());
      expect(loggedData.queues[0].pending).toBe(0);
      expect(loggedData.queues[0].active).toBe(0);
    });

    it("should log processing time stats for queues with sufficient data", async () => {
      // Add processing times to trigger stats logging
      for (let i = 1; i <= 15; i++) {
        service["jobStartTimes"].set(`sync-emails:job-${i}`, Date.now() - 1000);
        service.trackJobComplete(`job-${i}`, "sync-emails", true);
      }

      dataSource.query.mockResolvedValue([
        {
          pending: "5",
          active: "2",
          completed: "50",
          failed: "1",
        },
      ]);

      const loggerDebugSpy = jest
        .spyOn(service["logger"], "debug")
        .mockImplementation();

      await service.collectMetrics();

      // Should log processing time stats
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining("processing times"),
      );
      loggerDebugSpy.mockRestore();
    });
  });

  describe("getQueueHealth", () => {
    it("should return queue health metrics", async () => {
      const mockResults = {
        pending: "10",
        active: "5",
        completed: "100",
        failed: "2",
      };

      dataSource.query.mockResolvedValue([mockResults]);

      const result = await service.getQueueHealth();

      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("queues");
      expect(result).toHaveProperty("totalPending");
      expect(result).toHaveProperty("totalActive");
      expect(result).toHaveProperty("totalCompleted");
      expect(result).toHaveProperty("totalFailed");
      expect(result.queues).toHaveLength(10);
      expect(result.totalPending).toBe(100); // 10 queues * 10
    });

    it("should handle query errors for individual queues", async () => {
      dataSource.query
        .mockRejectedValueOnce(new Error("Database error"))
        .mockResolvedValue([
          {
            pending: "5",
            active: "2",
            completed: "50",
            failed: "1",
          },
        ]);

      const result = await service.getQueueHealth();

      expect(result.queues).toHaveLength(10);
      // Should continue processing even if one queue fails
    });

    it("should calculate totals correctly across all queues", async () => {
      dataSource.query.mockResolvedValue([
        {
          pending: "10",
          active: "5",
          completed: "100",
          failed: "2",
        },
      ]);

      const result = await service.getQueueHealth();

      expect(result.totalPending).toBe(100);
      expect(result.totalActive).toBe(50);
      expect(result.totalCompleted).toBe(1000);
      expect(result.totalFailed).toBe(20);
    });

    it("should include timestamp in ISO format", async () => {
      dataSource.query.mockResolvedValue([
        {
          pending: "0",
          active: "0",
          completed: "0",
          failed: "0",
        },
      ]);

      const result = await service.getQueueHealth();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("onModuleInit", () => {
    it("should start monitoring interval", async () => {
      jest.useFakeTimers();
      dataSource.query.mockResolvedValue([
        {
          pending: "0",
          active: "0",
          completed: "0",
          failed: "0",
        },
      ]);

      await service.onModuleInit();

      // Fast-forward time to trigger interval
      jest.advanceTimersByTime(61000); // 61 seconds

      // Should have called collectMetrics multiple times (initial + interval)
      expect(dataSource.query).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it("should collect initial metrics on init", async () => {
      dataSource.query.mockResolvedValue([
        {
          pending: "0",
          active: "0",
          completed: "0",
          failed: "0",
        },
      ]);

      await service.onModuleInit();

      expect(dataSource.query).toHaveBeenCalled();
    });
  });

  describe("onModuleDestroy", () => {
    it("should clear monitoring interval", () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");

      service["monitoringInterval"] = setInterval(() => {}, 1000);
      service.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(service["monitoringInterval"]).toBeNull();

      jest.useRealTimers();
      clearIntervalSpy.mockRestore();
    });

    it("should handle destroy when no interval set", () => {
      service["monitoringInterval"] = null;

      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
