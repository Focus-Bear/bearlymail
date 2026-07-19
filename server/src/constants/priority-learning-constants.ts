/**
 * Priority learning algorithm constants
 * Use these instead of magic numbers for priority learning parameters
 */

export const PRIORITY_LEARNING_CONSTANTS = {
  // LLM temperature parameters
  TEMPERATURE_DEFAULT: 0.7,
  TEMPERATURE_LOW: 0.3,
  TEMPERATURE_MEDIUM: 0.4,
  TEMPERATURE_NEGATIVE: -0.3,
  // Context window size
  CONTEXT_WINDOW: 2048,
  // Learning rate multiplier
  LEARNING_RATE: 1.5,
  // Penalty amount for negative adjustments
  PENALTY_AMOUNT: -5,
  // Sample sizes
  SAMPLE_SIZE: 50,
  MIN_SAMPLES: 15,
  MAX_SAMPLES: 20,
  // Urgency threshold
  URGENCY_HIGH_THRESHOLD: 90,
  // Priority score defaults and thresholds
  PRIORITY_SCORE_DEFAULT: 50,
  PRIORITY_THRESHOLD_LOW: 25,
  PRIORITY_THRESHOLD_MEDIUM: 50,
  PRIORITY_THRESHOLD_HIGH: 75,
} as const;
