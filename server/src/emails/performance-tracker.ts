import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { CloudWatchService } from "../aws/cloudwatch.service";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";

// Performance budgets in milliseconds
export const PERF_BUDGETS = {
  INBOX_TOTAL: 500,
  // Process mode can be slower (3.5s target)
  INBOX_PROCESS_TOTAL: 1000,
  THREAD_QUERY: 100,
  // Process mode query is more complex
  THREAD_QUERY_PROCESS: 300,
  THREAD_COUNT_QUERY: 50,
  // Raw SQL query for emails
  EMAIL_QUERY: 100,
  // Decrypting encrypted fields (from, fromName, subject, summary)
  DECRYPTION: 100,
  PRIORITY_CALC: 200,
  LABEL_CONVERT: 100,
  // Just combining thread info with emails (no decryption)
  THREAD_GROUPING: 50,
  // Max 3 seconds for priority explanation generation
  PRIORITY_EXPLANATION: 3000,
};

interface PerfSpan {
  name: string;
  start: number;
  end?: number;
  duration?: number;
  budget: number;
  exceeded?: boolean;
}

export class PerformanceTracker {
  private spans: PerfSpan[] = [];
  private startTime: number;
  private logger = new Logger("PerformanceTracker");
  private static logsDir = path.join(process.cwd(), "logs");
  private logFile = path.join(PerformanceTracker.logsDir, "performance.log");
  private cloudWatchService?: CloudWatchService;

  constructor(
    private operation: string,
    cloudWatchService?: CloudWatchService,
  ) {
    this.startTime = Date.now();
    this.cloudWatchService = cloudWatchService;
    // Ensure logs directory exists
    if (!fs.existsSync(PerformanceTracker.logsDir)) {
      fs.mkdirSync(PerformanceTracker.logsDir, { recursive: true });
    }
  }

  startSpan(name: string, budget: number): () => void {
    const span: PerfSpan = { name, start: Date.now(), budget };
    this.spans.push(span);
    return () => {
      span.end = Date.now();
      span.duration = span.end - span.start;
      span.exceeded = span.duration > budget;
    };
  }

  finish(mode?: "triage" | "action" | "follow-up"): void {
    const totalDuration = Date.now() - this.startTime;
    const exceededSpans = this.spans.filter((span) => span.exceeded);
    let budget: number;
    if (this.operation === "priority-explanation") {
      budget = PERF_BUDGETS.PRIORITY_EXPLANATION;
    } else if (this.operation === "search-relevance-explanations") {
      // 3 seconds for all search explanations
      budget = PERFORMANCE_BUDGETS.SEARCH_RELEVANCE_EXPLANATIONS;
    } else {
      budget =
        mode === "action"
          ? PERF_BUDGETS.INBOX_PROCESS_TOTAL
          : PERF_BUDGETS.INBOX_TOTAL;
    }
    const totalExceeded = totalDuration > budget;

    // Emit CloudWatch metrics for performance budget tracking
    if (this.cloudWatchService) {
      this.cloudWatchService
        .putPerformanceBudgetMetric({
          budgetName: this.operation,
          budgetType: "operation",
          durationMs: totalDuration,
          budgetMs: budget,
          exceeded: totalExceeded,
          metadata: {
            ...(mode && { Mode: mode }),
          },
        })
        .catch((err) => {
          this.logger.error("Failed to emit CloudWatch metric:", err);
        });
    }

    // Only log if the TOTAL budget was exceeded (not just individual spans)
    if (totalExceeded) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        operation: this.operation,
        totalDuration,
        totalBudget: budget,
        totalExceeded,
        mode: mode || "triage",
        spans: this.spans.map((span) => ({
          name: span.name,
          duration: span.duration,
          budget: span.budget,
          exceeded: span.exceeded,
        })),
        exceededSpans: exceededSpans.map(
          (span) =>
            `${span.name}: ${span.duration}ms (budget: ${span.budget}ms)`,
        ),
      };

      const logLine = `${JSON.stringify(logEntry)}\n`;

      // Log to console - only if total exceeded budget
      this.logger.warn(
        `⚠️ PERF ISSUE: ${this.operation} (mode: ${mode || "triage"}) took ${totalDuration}ms (budget: ${budget}ms)`,
      );
      exceededSpans.forEach((span) => {
        this.logger.warn(
          `   - ${span.name}: ${span.duration}ms exceeded budget of ${span.budget}ms`,
        );
      });

      // Append to log file
      try {
        fs.appendFileSync(this.logFile, logLine);
      } catch (err) {
        this.logger.error("Failed to write to performance log file:", err);
      }
    }
  }
}
