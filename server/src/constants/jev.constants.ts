export const JEV_QUESTION_TYPES = {
  NOUL: "noul",
  CHOICE: "choice",
  SCORE: "score",
} as const;

export const JEV = {
  API_URL: "https://api.typesafe.ai/v1/systemone",
  API_KEY_ENV: "TYPESAFE_AI_API_KEY",
  MODEL_ENV: "TYPESAFE_AI_MODEL",
  ENABLED_ENV: "JEV_CATEGORISATION_ENABLED",
  DEFAULT_MODEL: "jev-1.13.0",
  PROVIDER: "typesafe",
  REQUEST_TIMEOUT_MS: 5000,
  MAX_OPTIONS: 255,
  OTHER_OPTION: "0",
  OTHER_CATEGORY: "Other",
  QUESTION_ID: "category",
  QUESTION_TYPE: JEV_QUESTION_TYPES.CHOICE,
  // Acceptance policy, not a claim of calibrated 90% classification accuracy.
  MIN_ACCEPTED_CONFIDENCE: 0.9,
} as const;
