import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { StandardUnit } from "@aws-sdk/client-cloudwatch";
import { DataSource } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { QueueAutoscalingService } from "./queue-autoscaling.service";

describe("QueueAutoscalingService", () => {
  let service: QueueAutoscalingService;
  let dataSource: jest.Mocked<DataSource>;
  let cloudWatchService: jest.Mocked<CloudWatchService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueAutoscalingService,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
          },
        },
        {
          provide: CloudWatchService,
          useValue: {
            putMetrics: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                WORKER_MODE: "false",
                AUTOSCALING_ENABLED: "true",
                AUTOSCALING_CHECK_INTERVAL_SECONDS: "30",
                AUTOSCALING_MIN_WORKERS: "1",
                AUTOSCALING_MAX_WORKERS: "10",
                AUTOSCALING_QUEUE_DEPTH_PER_WORKER: "50",
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<QueueAutoscalingService>(QueueAutoscalingService);
    dataSource = module.get(DataSource);
    cloudWatchService = module.get(CloudWatchService);
    configService = module.get(ConfigService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any running intervals to prevent open handles
    if (service && service["monitoringInterval"]) {
      service.onModuleDestroy();
    }
  });

  describe("onModuleInit", () => {
    it("should start monitoring when enabled and not in worker mode", async () => {
      jest.useFakeTimers();
      dataSource.query.mockResolvedValue([{ pending: "0" }]);

      await service.onModuleInit();

      // Fast-forward time to trigger interval
      // 31 seconds
      jest.advanceTimersByTime(31000);

      expect(cloudWatchService.putMetrics).toHaveBeenCalled();

      // Clean up interval before restoring timers
      service.onModuleDestroy();
      jest.useRealTimers();
    });

    it("should not start monitoring when in worker mode", async () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === "WORKER_MODE") return "true";
        return undefined;
      });

      // Re-instantiate service with new config
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          QueueAutoscalingService,
          {
            provide: DataSource,
            useValue: { query: jest.fn() },
          },
          {
            provide: CloudWatchService,
            useValue: { putMetrics: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === "WORKER_MODE") return "true";
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const workerService = module.get<QueueAutoscalingService>(
        QueueAutoscalingService,
      );
      const loggerLogSpy = jest
        .spyOn(workerService["logger"], "log")
        .mockImplementation();

      await workerService.onModuleInit();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("disabled (running in worker mode)"),
      );

      loggerLogSpy.mockRestore();
    });

    it("should not start monitoring when disabled", async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          QueueAutoscalingService,
          {
            provide: DataSource,
            useValue: { query: jest.fn() },
          },
          {
            provide: CloudWatchService,
            useValue: { putMetrics: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === "AUTOSCALING_ENABLED") return "false";
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const disabledService = module.get<QueueAutoscalingService>(
        QueueAutoscalingService,
      );
      const loggerLogSpy = jest
        .spyOn(disabledService["logger"], "log")
        .mockImplementation();

      await disabledService.onModuleInit();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("disabled (AUTOSCALING_ENABLED=false)"),
      );

      loggerLogSpy.mockRestore();
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

  describe("checkAndPublishMetrics", () => {
    it("should calculate desired workers and publish metrics", async () => {
      // Mock queue depth: 550 pending jobs (11 queues * 50 each), 50 per worker = 11 workers, capped at max 10
      // 11 queues with 50 each = 550
      dataSource.query.mockResolvedValue([{ pending: "50" }]);

      await service.checkAndPublishMetrics();

      expect(cloudWatchService.putMetrics).toHaveBeenCalledWith([
        {
          name: "QueueDepth",
          // 11 queues * 50 pending each
          value: 550,
          unit: StandardUnit.Count,
        },
        {
          name: "DesiredWorkers",
          // Math.ceil(550 / 50) = 11, capped at maxWorkers = 10
          value: 10,
          unit: StandardUnit.Count,
        },
      ]);
    });

    it("should respect minimum workers", async () => {
      // Mock very low queue depth
      dataSource.query.mockResolvedValue([{ pending: "0" }]);

      await service.checkAndPublishMetrics();

      const metricsCall = cloudWatchService.putMetrics.mock.calls[0][0];
      const desiredWorkersMetric = metricsCall.find(
        (metric: Record<string, unknown>) => metric.name === "DesiredWorkers",
      );

      // minWorkers = 1
      expect(desiredWorkersMetric.value).toBeGreaterThanOrEqual(1);
    });

    it("should respect maximum workers", async () => {
      // Mock very high queue depth (1000 pending = 20 workers, but max is 10)
      // 10 queues * 100 = 1000
      dataSource.query.mockResolvedValue([{ pending: "100" }]);

      await service.checkAndPublishMetrics();

      const metricsCall = cloudWatchService.putMetrics.mock.calls[0][0];
      const desiredWorkersMetric = metricsCall.find(
        (metric: Record<string, unknown>) => metric.name === "DesiredWorkers",
      );

      // maxWorkers = 10
      expect(desiredWorkersMetric.value).toBeLessThanOrEqual(10);
    });

    it("should handle queue query errors gracefully", async () => {
      dataSource.query
        .mockRejectedValueOnce(new Error("Database error"))
        .mockResolvedValue([{ pending: "10" }]);

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      await service.checkAndPublishMetrics();

      // Should continue processing other queues
      expect(loggerWarnSpy).toHaveBeenCalled();

      loggerWarnSpy.mockRestore();
    });

    it("should handle CloudWatch errors gracefully", async () => {
      dataSource.query.mockResolvedValue([{ pending: "0" }]);
      cloudWatchService.putMetrics.mockRejectedValue(
        new Error("CloudWatch error"),
      );

      const loggerErrorSpy = jest
        .spyOn(service["logger"], "error")
        .mockImplementation();

      await service.checkAndPublishMetrics();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Error checking queue depth:",
        expect.any(Error),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe("getTotalQueueDepth", () => {
    it("should sum queue depth across all queues", async () => {
      dataSource.query.mockResolvedValue([{ pending: "10" }]);

      const depth = await service.getTotalQueueDepth();

      // 11 queues * 10 pending = 110
      expect(depth).toBe(110);
      // One per queue
      expect(dataSource.query).toHaveBeenCalledTimes(11);
    });

    it("should handle missing pending count", async () => {
      dataSource.query.mockResolvedValue([{}]);

      const depth = await service.getTotalQueueDepth();

      expect(depth).toBe(0);
    });

    it("should handle null/undefined pending count", async () => {
      dataSource.query.mockResolvedValue([{ pending: null }]);

      const depth = await service.getTotalQueueDepth();

      expect(depth).toBe(0);
    });

    it("should handle queue query errors for individual queues", async () => {
      dataSource.query
        .mockRejectedValueOnce(new Error("Queue 1 error"))
        .mockResolvedValue([{ pending: "5" }]);

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      const depth = await service.getTotalQueueDepth();

      // Should continue processing other queues
      expect(depth).toBeGreaterThanOrEqual(0);
      expect(loggerWarnSpy).toHaveBeenCalled();

      loggerWarnSpy.mockRestore();
    });
  });

  describe("calculateDesiredWorkers", () => {
    it("should calculate workers based on queue depth per worker", () => {
      // 150 jobs / 50 per worker = 3 workers
      const workers = service.calculateDesiredWorkers(150);

      expect(workers).toBe(3);
    });

    it("should round up fractional workers", () => {
      // 125 jobs / 50 per worker = 2.5, should round up to 3
      const workers = service.calculateDesiredWorkers(125);

      expect(workers).toBe(3);
    });

    it("should not exceed maximum workers", () => {
      // 1000 jobs / 50 per worker = 20, but max is 10
      const workers = service.calculateDesiredWorkers(1000);

      // maxWorkers
      expect(workers).toBe(10);
    });

    it("should not go below minimum workers", () => {
      // 0 jobs / 50 per worker = 0, but min is 1
      const workers = service.calculateDesiredWorkers(0);

      // minWorkers
      expect(workers).toBe(1);
    });

    it("should handle edge case at boundary", () => {
      // Exactly 50 jobs = 1 worker
      const workers1 = service.calculateDesiredWorkers(50);
      expect(workers1).toBe(1);

      // 51 jobs = 2 workers (rounded up)
      const workers2 = service.calculateDesiredWorkers(51);
      expect(workers2).toBe(2);
    });
  });
});
