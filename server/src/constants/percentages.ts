/**
 * Percentage and ratio constants
 * Use these instead of magic numbers for percentages and ratios
 */

export const PERCENTAGES = {
  ZERO: 0,
  ONE: 1,
  TWO: 2,
  FIVE: 5,
  TEN: 10,
  FIFTEEN: 15,
  TWENTY: 20,
  TWENTY_FIVE: 25,
  THIRTY: 30,
  FORTY: 40,
  FIFTY: 50,
  SEVENTY: 70,
  EIGHTY: 80,
  NINETY: 90,
  NINETY_FIVE: 95,
  ONE_HUNDRED: 100,
} as const;

export const RATIOS = {
  ZERO: 0,
  TINY: 0.01,
  SMALL: 0.1,
  HALF: 0.5,
  SIXTY_PERCENT: 0.6,
  SEVENTY_PERCENT: 0.7,
  THIRTY_PERCENT: 0.3,
  FORTY_PERCENT: 0.4,
  NEGATIVE_THIRTY_PERCENT: -0.3,
  NINETY_FIVE_PERCENT: 0.95,
  NINETY_NINE_PERCENT: 0.99,
  ONE_POINT_FIVE: 1.5,
  TWO_POINT_FIVE: 2.5,
} as const;
