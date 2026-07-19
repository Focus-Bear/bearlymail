import { Test, TestingModule } from "@nestjs/testing";
import * as fs from "fs";
import * as path from "path";
import { DataSource } from "typeorm";

import { RESOURCE_MONITOR_CONSTANTS } from "../constants/resource-monitor-constants";
import { ResourceMonitorService } from "./resource-monitor.service";

// Mock fs, path, and os modules
jest.mock("fs");
jest.mock("path");

const mockCpuData = [
  {
    model: "Intel",
    speed: 2400,
    times: { user: 1000, nice: 0, sys: 500, idle: 5000, irq: 0 },
  },
  {
    model: "Intel",
    speed: 2400,
    times: { user: 2000, nice: 0, sys: 1000, idle: 10000, irq: 0 },
  },
];

jest.mock("os", () => ({
  cpus: jest.fn(() => mockCpuData),
  loadavg: jest.fn(() => [1.5, 2.0, 1.8]),
  totalmem: jest.fn(() => 8 * 1024 * 1024 * 1024),
  freemem: jest.fn(() => 4 * 1024 * 1024 * 1024),
}));

import * as os from "os";

const mockCpus = os.cpus as jest.Mock;
const mockLoadavg = os.loadavg as jest.Mock;
const mockTotalmem = os.totalmem as jest.Mock;
const mockFreemem = os.freemem as jest.Mock;

describe("ResourceMonitorService", () => {
  let service: ResourceMonitorService;
  let dataSource: jest.Mocked<DataSource>;
  const mockMetricsLogFile = "/mock/path/logs/resource-metrics.log";

  beforeEach(async () => {
    // Mock path.join
    (path.join as jest.Mock).mockReturnValue(mockMetricsLogFile);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.appendFileSync as jest.Mock).mockReturnValue(undefined);

    // Mock os functions
    mockCpus.mockReturnValue([
      {
        model: "Intel",
        speed: 2400,
        times: {
          user: 1000,
          nice: 0,
          sys: 500,
          idle: 5000,
          irq: 0,
        },
      },
      {
        model: "Intel",
        speed: 2400,
        times: {
          user: 2000,
          nice: 0,
          sys: 1000,
          idle: 10000,
          irq: 0,
        },
      },
    ]);

    mockLoadavg.mockReturnValue([1.5, 2.0, 1.8]);
    // 8GB
    mockTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
    // 4GB
    mockFreemem.mockReturnValue(4 * 1024 * 1024 * 1024);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceMonitorService,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ResourceMonitorService>(ResourceMonitorService);
    dataSource = module.get(DataSource);
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any running intervals to prevent open handles
    if (service && service["monitoringInterval"]) {
      service.onModuleDestroy();
    }
    jest.restoreAllMocks();
  });

  describe("calculateCpuUsage", () => {
    it("should return 0 on first call", () => {
      const usage = service.calculateCpuUsage();

      expect(usage).toBe(0);
    });

    it("should calculate CPU usage correctly on subsequent calls", () => {
      // First call to initialize
      service.calculateCpuUsage();

      // Mock second CPU reading (higher usage)
      mockCpus.mockReturnValue([
        {
          model: "Intel",
          speed: 2400,
          times: {
            // Increased
            user: 2000,
            nice: 0,
            // Increased
            sys: 1000,
            // Less idle
            idle: 4000,
            irq: 0,
          },
        },
        {
          model: "Intel",
          speed: 2400,
          times: {
            // Increased
            user: 3000,
            nice: 0,
            // Increased
            sys: 2000,
            // Less idle
            idle: 8000,
            irq: 0,
          },
        },
      ]);

      // Advance time
      jest.spyOn(Date, "now").mockReturnValue(1000);

      const usage = service.calculateCpuUsage();

      expect(usage).toBeGreaterThan(0);
      expect(usage).toBeLessThanOrEqual(100);
    });

    it("should clamp CPU usage to 0-100 range", () => {
      // First call to initialize
      service.calculateCpuUsage();

      // Mock extreme values
      mockCpus.mockReturnValue([
        {
          model: "Intel",
          speed: 2400,
          times: {
            user: 999999,
            nice: 0,
            sys: 999999,
            idle: 0,
            irq: 0,
          },
        },
      ]);

      jest.spyOn(Date, "now").mockReturnValue(1000);

      const usage = service.calculateCpuUsage();

      expect(usage).toBeGreaterThanOrEqual(0);
      expect(usage).toBeLessThanOrEqual(100);
    });
  });

  describe("getDatabaseMetrics", () => {
    it("should return database connection metrics", async () => {
      dataSource.query.mockResolvedValue([
        {
          active: "5",
          idle: "10",
          total: "15",
        },
      ]);

      const metrics = await service.getDatabaseMetrics();

      expect(dataSource.query).toHaveBeenCalled();
      expect(metrics).toEqual({
        activeConnections: 5,
        idleConnections: 10,
        totalConnections: 15,
      });
    });

    it("should return zero metrics on error", async () => {
      dataSource.query.mockRejectedValue(new Error("Database error"));

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      const metrics = await service.getDatabaseMetrics();

      expect(metrics).toEqual({
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
      });

      loggerWarnSpy.mockRestore();
    });

    it("should handle missing result data", async () => {
      dataSource.query.mockResolvedValue([]);

      const metrics = await service.getDatabaseMetrics();

      expect(metrics).toEqual({
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
      });
    });

    it("should handle null/undefined values in result", async () => {
      dataSource.query.mockResolvedValue([
        {
          active: null,
          idle: undefined,
          total: "",
        },
      ]);

      const metrics = await service.getDatabaseMetrics();

      expect(metrics.activeConnections).toBe(0);
      expect(metrics.idleConnections).toBe(0);
      expect(metrics.totalConnections).toBe(0);
    });
  });

  describe("collectMetrics", () => {
    it("should collect and log resource metrics", async () => {
      dataSource.query.mockResolvedValue([
        {
          active: "5",
          idle: "10",
          total: "15",
        },
      ]);

      // Initialize CPU usage calculation
      service.calculateCpuUsage();

      await service.collectMetrics();

      expect(fs.appendFileSync).toHaveBeenCalled();
      const logCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      const loggedData = JSON.parse(logCall[1].trim());

      expect(loggedData).toHaveProperty("timestamp");
      expect(loggedData).toHaveProperty("cpu");
      expect(loggedData).toHaveProperty("memory");
      expect(loggedData).toHaveProperty("database");
      expect(loggedData.cpu).toHaveProperty("usage");
      expect(loggedData.cpu).toHaveProperty("loadAverage");
      expect(loggedData.memory).toHaveProperty("total");
      expect(loggedData.memory).toHaveProperty("free");
      expect(loggedData.memory).toHaveProperty("used");
      expect(loggedData.memory).toHaveProperty("usagePercent");
    });

    it("should log warning for high CPU usage", async () => {
      dataSource.query.mockResolvedValue([
        { active: "0", idle: "0", total: "0" },
      ]);

      // Initialize CPU usage
      service.calculateCpuUsage();

      // Mock high CPU usage
      jest
        .spyOn(service, "calculateCpuUsage")
        .mockReturnValue(RESOURCE_MONITOR_CONSTANTS.CPU_CRITICAL + 10);

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      await service.collectMetrics();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("High CPU usage"),
      );

      loggerWarnSpy.mockRestore();
    });

    it("should log warning for high memory usage", async () => {
      dataSource.query.mockResolvedValue([
        { active: "0", idle: "0", total: "0" },
      ]);

      // Mock high memory usage (90% used)
      // 100MB
      mockTotalmem.mockReturnValue(100 * 1024 * 1024);
      // 10MB (90% used)
      mockFreemem.mockReturnValue(10 * 1024 * 1024);

      service.calculateCpuUsage();

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      await service.collectMetrics();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("High memory usage"),
      );

      loggerWarnSpy.mockRestore();
    });

    it("should log warning for high database connections", async () => {
      dataSource.query.mockResolvedValue([
        {
          active: "50",
          idle: "50",
          total: String(RESOURCE_MONITOR_CONSTANTS.DB_CONNECTIONS_WARNING + 1),
        },
      ]);

      service.calculateCpuUsage();

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      await service.collectMetrics();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("High database connections"),
      );

      loggerWarnSpy.mockRestore();
    });

    it("should handle file write errors gracefully", async () => {
      dataSource.query.mockResolvedValue([
        { active: "0", idle: "0", total: "0" },
      ]);
      (fs.appendFileSync as jest.Mock).mockImplementation(() => {
        throw new Error("File write error");
      });

      service.calculateCpuUsage();

      const loggerErrorSpy = jest
        .spyOn(service["logger"], "error")
        .mockImplementation();

      await service.collectMetrics();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to write resource metrics to file:",
        expect.any(Error),
      );

      loggerErrorSpy.mockRestore();
    });

    it("should handle collection errors gracefully", async () => {
      mockTotalmem.mockImplementation(() => {
        throw new Error("OS error");
      });

      const loggerErrorSpy = jest
        .spyOn(service["logger"], "error")
        .mockImplementation();

      await service.collectMetrics();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Error collecting resource metrics:",
        expect.any(Error),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe("getCurrentMetrics", () => {
    it("should return current resource metrics", async () => {
      dataSource.query.mockResolvedValue([
        {
          active: "5",
          idle: "10",
          total: "15",
        },
      ]);

      service.calculateCpuUsage();

      const metrics = await service.getCurrentMetrics();

      expect(metrics).toHaveProperty("timestamp");
      expect(metrics).toHaveProperty("cpu");
      expect(metrics).toHaveProperty("memory");
      expect(metrics).toHaveProperty("database");
      expect(metrics.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(metrics.cpu.usage).toBeLessThanOrEqual(100);
      expect(metrics.memory.usagePercent).toBeGreaterThanOrEqual(0);
      expect(metrics.memory.usagePercent).toBeLessThanOrEqual(100);
    });

    it("should calculate memory usage correctly", async () => {
      dataSource.query.mockResolvedValue([
        { active: "0", idle: "0", total: "0" },
      ]);

      // 8GB total, 4GB free = 4GB used = 50% usage
      mockTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
      mockFreemem.mockReturnValue(4 * 1024 * 1024 * 1024);

      service.calculateCpuUsage();

      const metrics = await service.getCurrentMetrics();

      expect(metrics.memory.usagePercent).toBeCloseTo(50, 0);
      expect(metrics.memory.used).toBe(4 * 1024 * 1024 * 1024);
    });
  });

  describe("onModuleInit", () => {
    it("should start monitoring interval", async () => {
      jest.useFakeTimers();
      dataSource.query.mockResolvedValue([
        { active: "0", idle: "0", total: "0" },
      ]);

      service.calculateCpuUsage();

      await service.onModuleInit();

      // Fast-forward time to trigger interval
      // 61 seconds
      jest.advanceTimersByTime(61000);

      // Should have called collectMetrics multiple times
      expect(fs.appendFileSync).toHaveBeenCalled();

      // Clean up interval before restoring timers
      service.onModuleDestroy();
      jest.useRealTimers();
    });

    it("should collect initial metrics on init", async () => {
      dataSource.query.mockResolvedValue([
        { active: "0", idle: "0", total: "0" },
      ]);

      service.calculateCpuUsage();

      await service.onModuleInit();

      expect(fs.appendFileSync).toHaveBeenCalled();

      // Clean up interval
      service.onModuleDestroy();
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
