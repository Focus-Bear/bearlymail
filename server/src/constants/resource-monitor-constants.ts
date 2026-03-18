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
  // Database connection thresholds (absolute counts, not percentages)
  // Tune these to match your RDS instance's actual max_connections limit.
  // Rule of thumb: warn at ~70%, critical at ~85% of max_connections.
  // Default targets a t4g.micro (max_connections ≈ 112): warn at 80, critical at 95.
  // If you change instance type, update these values to match the new limit.
  // Warn when > 80 connections
  DB_CONNECTIONS_WARNING: 80,
  // Critical when > 95 connections
  DB_CONNECTIONS_CRITICAL: 95,
} as const;
