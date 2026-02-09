import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Phase {
  name: string;
  duration: number;
}

interface JobLogEntry {
  timestamp: string;
  jobName: string;
  jobId: string;
  userId?: string;
  emailId?: string;
  threadId?: string;
  syncWindowHours?: number;
  forceRecalculate?: boolean;
  isContinuation?: boolean;
  threadCount?: number;
  duration: number;
  budget: number;
  exceeded: boolean;
  phases?: Record<string, number>;
  error?: string;
}

export class JobPerformanceTracker {
  private readonly logger = new Logger("JobPerformanceTracker");
  private static logsDir = path.join(process.cwd(), "logs");
  private readonly logFile = path.join(
    JobPerformanceTracker.logsDir,
    "performance.log",
  );
  public readonly startTime: number;
  private readonly jobName: string;
  private readonly jobId: string;
  private readonly budget: number;
  private phases: Map<string, number> = new Map();
  private phaseStartTimes: Map<string, number> = new Map();
  private metadata: {
    userId?: string;
    emailId?: string;
    threadId?: string;
    syncWindowHours?: number;
    forceRecalculate?: boolean;
    isContinuation?: boolean;
    threadCount?: number;
  } = {};

  constructor(jobName: string, jobId: string) {
    this.jobName = jobName;
    this.jobId = jobId;
    this.startTime = Date.now();

    // Get budget for this job type
    const budgetKey =
      `JOB_${jobName.toUpperCase().replace(/-/g, "_")}` as keyof typeof PERFORMANCE_BUDGETS;
    this.budget =
      PERFORMANCE_BUDGETS[budgetKey] || PERFORMANCE_BUDGETS.JOB_REFINE_PRIORITY;

    // Ensure logs directory exists
    if (!fs.existsSync(JobPerformanceTracker.logsDir)) {
      fs.mkdirSync(JobPerformanceTracker.logsDir, { recursive: true });
    }
  }

  /**
   * Set metadata for the job (userId, emailId, etc.)
   */
  setMetadata(metadata: {
    userId?: string;
    emailId?: string;
    threadId?: string;
    syncWindowHours?: number;
    forceRecalculate?: boolean;
    isContinuation?: boolean;
    threadCount?: number;
  }): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  /**
   * Start tracking a phase
   */
  startPhase(name: string): void {
    this.phaseStartTimes.set(name, Date.now());
  }

  /**
   * End tracking a phase
   */
  endPhase(name: string): void {
    const startTime = this.phaseStartTimes.get(name);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.phases.set(name, duration);
      this.phaseStartTimes.delete(name);
    }
  }

  /**
   * Finish tracking and log to performance.log
   * Always logs (not just on violation) so we can see all job durations
   */
  finish(error?: Error): void {
    const duration = Date.now() - this.startTime;
    const exceeded = duration > this.budget;

    const logEntry: JobLogEntry = {
      timestamp: new Date().toISOString(),
      jobName: this.jobName,
      jobId: this.jobId,
      userId: this.metadata.userId,
      emailId: this.metadata.emailId,
      threadId: this.metadata.threadId,
      syncWindowHours: this.metadata.syncWindowHours,
      forceRecalculate: this.metadata.forceRecalculate,
      isContinuation: this.metadata.isContinuation,
      threadCount: this.metadata.threadCount,
      duration,
      budget: this.budget,
      exceeded,
      phases: Object.fromEntries(this.phases),
      ...(error && { error: error.message }),
    };

    const logLine = `${JSON.stringify(logEntry)}\n`;

    // Always log to file
    try {
      fs.appendFileSync(this.logFile, logLine, "utf8");
    } catch (err) {
      this.logger.error("Failed to write to performance log file:", err);
    }

    // Log to console if budget exceeded or error
    if (exceeded) {
      this.logger.warn(
        `⚠️ JOB PERF: ${this.jobName} (${this.jobId}) took ${duration}ms (budget: ${this.budget}ms)`,
      );
      if (this.phases.size > 0) {
        const phaseSummary = Array.from(this.phases.entries())
          .map(([name, phaseDuration]) => `  - ${name}: ${phaseDuration}ms`)
          .join("\n");
        this.logger.warn(`Phases:\n${phaseSummary}`);
      }
    }

    if (error) {
      this.logger.error(
        `❌ JOB ERROR: ${this.jobName} (${this.jobId}) failed after ${duration}ms: ${error.message}`,
      );
    }
  }
}
