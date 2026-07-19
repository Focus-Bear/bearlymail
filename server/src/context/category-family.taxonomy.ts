/**
 * Category families — the coarse level of the category hierarchy.
 *
 * A user's taxonomy can hold ~90 fine-grained, often near-duplicate categories
 * (e.g. "GitHub PR Updates" vs "GitHub Bot PR Updates" vs "Automated GitHub
 * comments from bots"). Families group them so the inbox can be navigated at a
 * coarse level and the local classifier can commit a confident family even when
 * the exact sibling is ambiguous.
 *
 * `assignFamily` maps a category to a family with ordered keyword rules on the
 * category *name* (the part before the " - " / ": " description separator),
 * rather than a hard-coded list of exact category names. That keeps the rules
 * robust to new and renamed categories and avoids false matches on incidental
 * words in descriptions (negations like "... NOT pull requests", "Upwork
 * *Plat*form", "grant access"). First matching rule wins, so order matters.
 *
 * This mirrors `local-models/taxonomy.py`; keep the two in sync.
 */

export const OTHER_FAMILY = "Other / Uncategorised";

interface FamilyRule {
  family: string;
  /** Substrings matched case-insensitively in the category name. A keyword
   * wrapped in word-boundary form (see WORD_BOUNDARY) matches a whole word. */
  keywords: string[];
}

/** Keywords that must match on a word boundary (so "form" doesn't fire on
 * "platform", "hr" doesn't fire on "chrome"). */
const WORD_BOUNDARY = new Set(["pr", "prs", "form", "hr", "ux"]);
const WORD_BOUNDARY_REGEXES = new Map<string, RegExp>(
  Array.from(WORD_BOUNDARY).map((kw) => [kw, new RegExp(`\\b${kw}\\b`)]),
);

const FAMILY_RULES: FamilyRule[] = [
  {
    family: "GitHub / CI & Build",
    keywords: [
      "ci/cd",
      "ci pipeline",
      "pipeline failure",
      "build/deployment",
      "build error",
      "deployment error",
      "apps script alert",
      "github actions",
    ],
  },
  {
    family: "GitHub / Issues",
    keywords: [
      "github issue",
      "issue status",
      "bug issue",
      "human-reported bug",
      "bug report",
      "qa passed",
      "qa failed",
      "issues raised by qa",
      "dev/test github",
      "customer feedback",
      "feature request",
    ],
  },
  {
    family: "GitHub / Pull Requests",
    keywords: [
      "pull request",
      "pr update",
      "pr from",
      "prs from",
      "pr",
      "prs",
      "dependency update",
      "dependabot",
      "github comments from bots",
      "ai generated pr",
    ],
  },
  {
    family: "GitHub / Access & Projects",
    keywords: ["github project", "repo access", "project & access"],
  },
  {
    family: "Alerts & Monitoring",
    keywords: [
      "system alert",
      "sentry",
      "monitoring alert",
      "keyword monitoring",
      "content monitoring",
      "email delivery failure",
      "cloud budget",
      "automated meeting record",
      "product update",
      "automated system",
    ],
  },
  {
    family: "Security & Auth",
    keywords: [
      "security",
      "2fa",
      "passcode",
      "credential",
      "account security",
      "access/credential",
      "compliance",
    ],
  },
  {
    family: "Finance & Payments",
    keywords: [
      "payment",
      "financial",
      "invoice",
      "billing",
      "subscription",
      "payroll",
      "fundraising",
      "investor",
      "grant",
      "insurance",
    ],
  },
  {
    family: "Meetings & Calendar",
    keywords: [
      "meeting",
      "standup",
      "okr",
      "planning",
      "calendar",
      "reschedule",
      "travel approval",
      "recap",
      "acceptances to internal",
      "declines to internal",
    ],
  },
  {
    family: "Documents & Forms",
    keywords: [
      "document",
      "form",
      "form response",
      "consent",
      "approval",
      "survey",
      "documentation review",
      "design & ux notification",
      "signature",
    ],
  },
  {
    family: "Newsletters & Marketing",
    keywords: [
      "newsletter",
      "marketing",
      "industry news",
      "industry event",
      "promotion",
      "consumer marketing",
      "supplier newsletter",
      "shopping",
      "cart reminder",
      "mailing list",
    ],
  },
  {
    family: "Social & Networking",
    keywords: ["social", "linkedin", "networking", "cold outreach", "mention"],
  },
  {
    family: "Shipping & Delivery",
    keywords: ["shipping", "delivery", "package", "tracking"],
  },
  {
    family: "People, HR & Academia",
    keywords: [
      "hr",
      "human resources",
      "internship",
      "university",
      "academic",
      "phd",
      "reference request",
      "work hours",
      "holiday",
      "conference",
      "milestone",
      "auto responses from other people",
      "new team members",
    ],
  },
  {
    family: "Sales, Partnerships & Support",
    keywords: [
      "sales",
      "partnership",
      "product strategy",
      "positioning",
      "upwork",
      "contractor",
      "support ticket",
      "follow-up & chasing",
      "chasing replies",
    ],
  },
  {
    family: "Events & Competitions",
    keywords: [
      "competition",
      "professional events",
      "panel",
      "meetup",
      "showcase",
    ],
  },
  {
    family: "Media & Communications",
    keywords: ["media & communications", "podcast", "ux"],
  },
  {
    family: "Legal & IP",
    keywords: ["ip ownership", "legal", "intellectual property"],
  },
];

const SEPARATOR = / - |: /;
const LEADING_NON_ALNUM = /^[^a-z0-9]+/;

/** The category name, lowercased, with the leading emoji and the trailing
 * " - description" / ": description" stripped off. */
export function categoryName(category: string): string {
  const head = category.split(SEPARATOR, 1)[0] ?? category;
  return head.toLowerCase().replace(LEADING_NON_ALNUM, "").trim();
}

function matches(keyword: string, name: string): boolean {
  const regex = WORD_BOUNDARY_REGEXES.get(keyword);
  if (regex) return regex.test(name);
  return name.includes(keyword);
}

/** Map a category (name + optional description) to its family. */
export function assignFamily(category: string | null | undefined): string {
  if (!category) return OTHER_FAMILY;
  const name = categoryName(category);
  for (const { family, keywords } of FAMILY_RULES) {
    for (const keyword of keywords) {
      if (matches(keyword, name)) return family;
    }
  }
  return OTHER_FAMILY;
}

/** The fixed list of families (plus Other), order preserved. */
export function allFamilies(): string[] {
  return [...FAMILY_RULES.map((rule) => rule.family), OTHER_FAMILY];
}
