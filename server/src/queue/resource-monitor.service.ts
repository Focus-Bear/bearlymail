import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DataSource } from "typeorm";

import { RESOURCE_MONITOR_CONSTANTS } from "../constants/resource-monitor-constants";
import { BYTE_CONVERSIONS } from "../constants/service-constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "../utils/logs-dir";

interface ResourceMetrics {
  timestamp: string;
  cpu: {
    usage: number;
    // Percentage
    loadAverage: number[];
  };
  memory: {
    total: number;
    // bytes
    free: number;
    // bytes
    used: number;
    // bytes
    usagePercent: number;
  };
  database: {
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
  };
}

@Injectable()
export class ResourceMonitorService implements OnModuleInit {
  private readonly logger = new Logger(ResourceMonitorService.name);
  private readonly metricsLogFile: string;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private previousCpuUsage: ReturnType<typeof os.cpus> | null = null;
  private previousCpuTime: number = 0;

  constructor(private dataSource: DataSource) {
    ensureLogsDirSync();
    this.metricsLogFile = path.join(LOGS_DIR, "resource-metrics.log");
  }

  async onModuleInit() {
    // Start monitoring every 60 seconds
    const intervalSeconds = parseInt(
      process.env.RESOURCE_MONITOR_INTERVAL_SECONDS || "60",
      10,
    );
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics().catch((err) => {
        this.logger.error("Error collecting resource metrics:", err);
      });
    }, intervalSeconds * MS_PER_SECOND);

    // Collect initial metrics
    await this.collectMetrics();
    this.logger.log(
      `Resource monitoring started (interval: ${intervalSeconds}s)`,
    );
  }

  onModuleDestroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Calculate CPU usage percentage
   */
  private calculateCpuUsage(): number {
    const cpus = os.cpus();
    const now = Date.now();

    if (!this.previousCpuUsage || this.previousCpuTime === 0) {
      this.previousCpuUsage = cpus;
      this.previousCpuTime = now;
      return 0;
    }

    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < cpus.length; i++) {
      const cpu = cpus[i];
      const prevCpu = this.previousCpuUsage[i];

      const idle = cpu.times.idle - prevCpu.times.idle;
      const user = cpu.times.user - prevCpu.times.user;
      const nice = cpu.times.nice - prevCpu.times.nice;
      const sys = cpu.times.sys - prevCpu.times.sys;
      const irq = cpu.times.irq - prevCpu.times.irq;

      totalIdle += idle;
      totalTick += idle + user + nice + sys + irq;
    }

    this.previousCpuUsage = cpus;
    this.previousCpuTime = now;

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~((100 * idle) / total);

    return Math.max(0, Math.min(100, usage));
  }

  /**
   * Get database connection pool metrics
   */
  private async getDatabaseMetrics(): Promise<{
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
  }> {
    try {
      // TypeORM doesn't expose connection pool metrics directly
      // We'll query the database for active connections
      const result = await this.dataSource.query(`
        SELECT 
          count(*) FILTER (WHERE state = 'active') as active,
          count(*) FILTER (WHERE state = 'idle') as idle,
          count(*) as total
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);

      if (result && result.length > 0) {
        return {
          activeConnections: parseInt(result[0].active || "0", 10),
          idleConnections: parseInt(result[0].idle || "0", 10),
          totalConnections: parseInt(result[0].total || "0", 10),
        };
      }
    } catch (error) {
      this.logger.warn("Failed to get database connection metrics:", error);
    }

    return {
      activeConnections: 0,
      idleConnections: 0,
      totalConnections: 0,
    };
  }

  /**
   * Collect resource metrics
   */
  async collectMetrics(): Promise<void> {
    try {
      const cpuUsage = this.calculateCpuUsage();
      const loadAverage = os.loadavg();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      const dbMetrics = await this.getDatabaseMetrics();

      const metrics: ResourceMetrics = {
        timestamp: new Date().toISOString(),
        cpu: {
          usage: cpuUsage,
          loadAverage,
        },
        memory: {
          total: totalMemory,
          free: freeMemory,
          used: usedMemory,
          usagePercent: memoryUsagePercent,
        },
        database: dbMetrics,
      };

      // Log to file in development only. In production the container
      // filesystem is read-only, so the write throws ENOENT every time and the
      // error log itself becomes high-volume CloudWatch spam.
      if (isDevelopment) {
        const logLine = `${JSON.stringify(metrics)}\n`;
        try {
          fs.appendFileSync(this.metricsLogFile, logLine);
        } catch (error) {
          this.logger.error("Failed to write resource metrics to file:", error);
        }
      }

      // Log warnings for high resource usage
      if (cpuUsage > RESOURCE_MONITOR_CONSTANTS.CPU_CRITICAL) {
        this.logger.warn(`⚠️ High CPU usage: ${cpuUsage.toFixed(1)}%`);
      }
      if (memoryUsagePercent > RESOURCE_MONITOR_CONSTANTS.MEMORY_CRITICAL) {
        this.logger.warn(
          `⚠️ High memory usage: ${memoryUsagePercent.toFixed(1)}% (${(usedMemory / BYTE_CONVERSIONS.GB).toFixed(2)}GB used)`,
        );
      }
      if (
        dbMetrics.totalConnections >
        RESOURCE_MONITOR_CONSTANTS.DB_CONNECTIONS_CRITICAL
      ) {
        this.logger.error(
          `🔴 CRITICAL database connections: ${dbMetrics.totalConnections} total (limit: ~112 on t4g.micro). RDS may reject new connections.`,
        );
      } else if (
        dbMetrics.totalConnections >
        RESOURCE_MONITOR_CONSTANTS.DB_CONNECTIONS_WARNING
      ) {
        this.logger.warn(
          `⚠️ High database connections: ${dbMetrics.totalConnections} total, ${dbMetrics.activeConnections} active`,
        );
      }
    } catch (error) {
      this.logger.error("Error collecting resource metrics:", error);
    }
  }

  /**
   * Get current resource metrics
   */
  async getCurrentMetrics(): Promise<ResourceMetrics> {
    const cpuUsage = this.calculateCpuUsage();
    const loadAverage = os.loadavg();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    const dbMetrics = await this.getDatabaseMetrics();

    return {
      timestamp: new Date().toISOString(),
      cpu: {
        usage: cpuUsage,
        loadAverage,
      },
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: usedMemory,
        usagePercent: memoryUsagePercent,
      },
      database: dbMetrics,
    };
  }
}
