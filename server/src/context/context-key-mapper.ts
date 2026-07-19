import { ContextKey } from "../database/entities/user-context.entity";

const NOT_URGENT_INDICATORS = [
  "low priority",
  "not urgent",
  "delayed",
  "absent",
  "ignores",
  "archives",
  "unread",
  "does not reply",
  "doesn't reply",
  "no reply",
  "monitoring without",
  "low immediate priority",
  "lower priority",
  "non-urgent",
];

function isUserInfoKey(keyUpper: string, keyLower: string): boolean {
  return (
    keyUpper === "USER_INFO" ||
    keyUpper === "USER" ||
    keyLower.includes("role") ||
    keyLower.includes("responsibility") ||
    keyLower.includes("job") ||
    keyLower.includes("position") ||
    keyLower.includes("works as") ||
    keyLower.includes("occupation")
  );
}

function isWorkingOnKey(keyUpper: string, keyLower: string): boolean {
  return (
    keyUpper === "CURRENT_TOPIC" ||
    keyUpper === "WORKING_ON" ||
    keyUpper === "PROJECT" ||
    keyLower.includes("team") ||
    keyLower.includes("management") ||
    keyLower.includes("coordination") ||
    keyLower.includes("work") ||
    keyLower.includes("task") ||
    keyLower.includes("project") ||
    keyLower.includes("initiative") ||
    keyLower.includes("coordinate") ||
    keyLower.includes("supervise")
  );
}

function deriveWorkingOnPriority(valueLower: string): number {
  if (valueLower.includes("high") || valueLower.includes("urgent")) return 1;
  if (valueLower.includes("low")) return 3;
  return 2;
}

function isNotImportantKey(keyUpper: string, keyLower: string): boolean {
  return (
    keyUpper === "NOT_IMPORTANT" ||
    keyUpper === "NOT IMPORTANT" ||
    keyLower.includes("don't care") ||
    keyLower.includes("dont care") ||
    keyLower.includes("low priority") ||
    keyLower.includes("ignore")
  );
}

function isGoalKey(keyUpper: string, keyLower: string): boolean {
  return (
    keyUpper === "MY_GOALS" ||
    keyUpper === "GOALS" ||
    keyUpper === "GOAL" ||
    keyLower.includes("objective") ||
    keyLower.includes("target") ||
    keyLower.includes("aspiration")
  );
}

const WORKING_ON_VALUE_TERMS = [
  "manages",
  "coordinates",
  "team",
  "supervises",
  "oversees",
  "leads",
  "coordination",
  "management",
  "project",
  "working on",
  "currently",
  "initiative",
];

const USER_INFO_VALUE_TERMS = [
  "role",
  "responsible for",
  "works as",
  "position",
  "occupation",
  "job",
  "career",
];

const MY_GOALS_VALUE_TERMS = [
  "goal",
  "objective",
  "target",
  "aspiration",
  "strive",
];

function inferFromValue(
  valueLower: string,
): { key: ContextKey; priority?: number } | null {
  if (WORKING_ON_VALUE_TERMS.some((term) => valueLower.includes(term))) {
    return { key: ContextKey.WORKING_ON, priority: 2 };
  }
  if (USER_INFO_VALUE_TERMS.some((term) => valueLower.includes(term))) {
    return { key: ContextKey.USER_INFO };
  }
  if (MY_GOALS_VALUE_TERMS.some((term) => valueLower.includes(term))) {
    return { key: ContextKey.MY_GOALS };
  }
  return null;
}

export function mapContextItemKey(
  keyUpper: string,
  keyLower: string,
  valueLower: string,
): { key: ContextKey; priority?: number } {
  if (isUserInfoKey(keyUpper, keyLower)) {
    return { key: ContextKey.USER_INFO };
  }

  if (isWorkingOnKey(keyUpper, keyLower)) {
    return {
      key: ContextKey.WORKING_ON,
      priority: deriveWorkingOnPriority(valueLower),
    };
  }

  if (keyUpper === "URGENT") {
    const isNotUrgent = NOT_URGENT_INDICATORS.some((ind) =>
      valueLower.includes(ind),
    );
    return { key: isNotUrgent ? ContextKey.NOT_IMPORTANT : ContextKey.URGENT };
  }

  if (isNotImportantKey(keyUpper, keyLower)) {
    return { key: ContextKey.NOT_IMPORTANT };
  }

  if (isGoalKey(keyUpper, keyLower)) {
    return { key: ContextKey.MY_GOALS };
  }

  if (
    keyUpper === "DONT_CARE" ||
    keyUpper === "DON'T_CARE" ||
    keyLower.includes("dont care") ||
    keyLower.includes("don't care")
  ) {
    return { key: ContextKey.DONT_CARE };
  }

  if (
    keyUpper === "EMAIL_CATEGORY" ||
    keyUpper === "CATEGORY" ||
    keyLower.includes("email category") ||
    keyLower.includes("email type")
  ) {
    return { key: ContextKey.EMAIL_CATEGORY };
  }

  return inferFromValue(valueLower) ?? { key: ContextKey.OTHER };
}
