/**
 * Priority-related constants
 * Use these instead of magic numbers for priority calculations
 */

export const PRIORITY_SCORES = {
  MIN: 0,
  MAX: 100,
  URGENT_THRESHOLD: 90,
  HIGH_THRESHOLD: 75,
  MEDIUM_THRESHOLD: 50,
  LOW_THRESHOLD: 25,
  VERY_HIGH: 95,
  HIGH: 80,
} as const;

export const STAR_COUNTS = {
  MIN: 0,
  MAX: 3,
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const;

export const PRIORITY_BOOSTS = {
  GOAL_ALIGNMENT: 15,
  PROJECT_PRIORITY_1: 15,
  PROJECT_PRIORITY_2: 10,
  PROJECT_PRIORITY_3: 5,
  URGENT_KEYWORD: 25,
  LOW_INTEREST_PENALTY: -20,
  RECENCY_TODAY: 30,
  RECENCY_24H: 25,
  RECENCY_7D: 20,
  RECENCY_30D: 5,
  RECENCY_60D_PENALTY: -30,
  RECENCY_30D_PENALTY: -20,
  RELEVANCE_THRESHOLD: 40,
} as const;
