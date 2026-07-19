/**
 * Member role and status constants for organization membership comparisons.
 * Use these instead of inline magic string literals.
 * Part of issue #1095 (eliminate magic strings across the codebase — Phase 3).
 */

export const MEMBER_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type MemberRole = (typeof MEMBER_ROLES)[keyof typeof MEMBER_ROLES];

export const MEMBER_STATUS = {
  ACTIVE: "active",
  PENDING: "pending",
  INACTIVE: "inactive",
  DEACTIVATED: "deactivated",
} as const;

export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];
