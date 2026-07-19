/**
 * Category families — the coarse level of the label hierarchy.
 *
 * TypeScript port of `local-models/taxonomy.py` (`assign_family`). It MUST stay
 * in sync with that file: the model predicts a family head, and we score live
 * family agreement by mapping the LLM's free-text category through these same
 * rules. Matching the category *name* (the part before the " - " / ": "
 * description separator), first rule wins, so order is significant.
 */

/** Catch-all family for the LLM's null category and anything unmatched. */
export const OTHER_FAMILY = "Other / Uncategorised";

const SEPARATOR_RE = / - |: /;
const LEADING_NON_ALNUM_RE = /^[^a-z0-9]+/;

/**
 * (family, keywords) in priority order. Keywords match case-insensitively as
 * substrings of the category *name*, except entries wrapped in `\b...\b` which
 * match on a word boundary (so "form" doesn't fire on "platform").
 */
const FAMILY_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    "GitHub / CI & Build",
    [
      "ci/cd",
      "ci pipeline",
      "pipeline failure",
      "build/deployment",
      "build error",
      "deployment error",
      "apps script alert",
      "github actions",
    ],
  ],
  [
    "GitHub / Issues",
    [
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
  ],
  [
    "GitHub / Pull Requests",
    [
      "pull request",
      "pr update",
      "pr from",
      "prs from",
      "\\bpr\\b",
      "\\bprs\\b",
      "dependency update",
      "dependabot",
      "github comments from bots",
      "ai generated pr",
    ],
  ],
  [
    "GitHub / Access & Projects",
    ["github project", "repo access", "project & access"],
  ],
  [
    "Alerts & Monitoring",
    [
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
  ],
  [
    "Security & Auth",
    [
      "security",
      "2fa",
      "passcode",
      "credential",
      "account security",
      "access/credential",
      "compliance",
    ],
  ],
  [
    "Finance & Payments",
    [
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
  ],
  [
    "Meetings & Calendar",
    [
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
  ],
  [
    "Documents & Forms",
    [
      "document",
      "\\bform\\b",
      "form response",
      "consent",
      "approval",
      "survey",
      "documentation review",
      "design & ux notification",
      "signature",
    ],
  ],
  [
    "Newsletters & Marketing",
    [
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
  ],
  [
    "Social & Networking",
    ["social", "linkedin", "networking", "cold outreach", "mention"],
  ],
  ["Shipping & Delivery", ["shipping", "delivery", "package", "tracking"]],
  [
    "People, HR & Academia",
    [
      "\\bhr\\b",
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
  ],
  [
    "Sales, Partnerships & Support",
    [
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
  ],
  [
    "Events & Competitions",
    ["competition", "professional events", "panel", "meetup", "showcase"],
  ],
  ["Media & Communications", ["media & communications", "podcast", "\\bux\\b"]],
  ["Legal & IP", ["ip ownership", "legal", "intellectual property"]],
];

/**
 * Rules with their `\b...\b` keywords pre-compiled to RegExp once at module
 * load, so `assignFamily` never builds a RegExp inside its nested loop during
 * batch email processing. Plain-substring keywords stay strings.
 */
const COMPILED_FAMILY_RULES: ReadonlyArray<
  readonly [string, ReadonlyArray<string | RegExp>]
> = FAMILY_RULES.map(
  ([family, keywords]) =>
    [
      family,
      keywords.map((kw) =>
        kw.startsWith("\\b") && kw.endsWith("\\b") ? new RegExp(kw) : kw,
      ),
    ] as const,
);

/** The category name, lowercased, with leading emoji and trailing description stripped. */
function categoryName(category: string): string {
  const head = category.split(SEPARATOR_RE, 1)[0] ?? "";
  return head.toLowerCase().replace(LEADING_NON_ALNUM_RE, "").trim();
}

/** Map a category (name + optional description) to its family. */
export function assignFamily(category: string | null | undefined): string {
  if (!category) {
    return OTHER_FAMILY;
  }
  const name = categoryName(category);
  for (const [family, keywords] of COMPILED_FAMILY_RULES) {
    for (const kw of keywords) {
      if (kw instanceof RegExp) {
        if (kw.test(name)) {
          return family;
        }
      } else if (name.includes(kw)) {
        return family;
      }
    }
  }
  return OTHER_FAMILY;
}
