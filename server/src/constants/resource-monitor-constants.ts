/**
 * Resource monitoring constants
 * Use these instead of magic numbers for CPU and memory monitoring thresholds
 */

export const RESOURCE_MONITOR_CONSTANTS = {
  // CPU thresholds (percentages)
  CPU_WARNING: 50,
  CPU_CRITICAL: 80,
  CPU_CRITICAL_LOW: 40,
  // Memory thresholds (percentages)
  MEMORY_WARNING: 50,
  MEMORY_CRITICAL: 80,
  MEMORY_CRITICAL_LOW: 40,
  // Multipliers for calculations
  CPU_MULTIPLIER: 2.5,
  MEMORY_MULTIPLIER: 0.7,
  // Percentiles for statistics
  P50: 0.5,
  P95: 0.95,
  P99: 0.99,
} as const;
