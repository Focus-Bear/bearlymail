export const DEFAULT_CONTACT_TYPES = [
  "lead",
  "customer",
  "team_member",
  "advisor",
  "stranger",
  "bot",
  "partner",
  "spammer",
] as const;

export type DefaultContactType = (typeof DEFAULT_CONTACT_TYPES)[number];
