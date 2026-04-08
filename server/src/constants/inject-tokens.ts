/**
 * NestJS dependency injection token constants.
 * Use these instead of inline magic string literals in @Inject() decorators.
 * Part of issue #1095 (eliminate magic strings across the codebase — Phase 4).
 */

export const INJECT_TOKENS = {
  PG_BOSS: "PG_BOSS",
} as const;

export type InjectToken = (typeof INJECT_TOKENS)[keyof typeof INJECT_TOKENS];
