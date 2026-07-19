"""
Category families — the coarse level of the label hierarchy.

The user's taxonomy has ~90 fine-grained, often near-duplicate categories
(e.g. "GitHub PR Updates" vs "GitHub Bot PR Updates" vs "Automated GitHub
comments from bots"). The error analysis showed the model is reliably right at
the *family* level and loses accuracy only picking the wrong sibling within a
family. So we predict family first (high confidence, broad coverage) and only
then the sibling, falling back to the LLM when the sibling is ambiguous.

`assign_family` maps a category to a family with ordered keyword rules rather
than a hard-coded list of the user's exact category names. That keeps
business-specific category names out of source control and means a newly
created category is placed automatically instead of becoming an orphan.

Two deliberate choices keep the rules robust:
  * Match the category **name** (the part before the " - " / ": " description
    separator), not the description. Descriptions are full of incidental words
    and negations ("Customer feedback ... NOT pull requests", "Upwork
    *Plat*form", "grant access") that produced false matches against the wrong
    family.
  * First matching rule wins, so the order below is significant — Issues are
    checked before Pull Requests, and the email-delivery-failure alert is
    checked before the generic Shipping "delivery" rule.
"""

from __future__ import annotations

import re

# Catch-all family for the LLM's null category and anything unmatched.
OTHER_FAMILY = "Other / Uncategorised"

_SEPARATOR_RE = re.compile(r" - |: ")
_LEADING_NON_ALNUM_RE = re.compile(r"^[^a-z0-9]+")

# (family, [keywords]) in priority order. Keywords match case-insensitively as
# substrings of the category *name*, except entries written as \b...\b which
# match on a word boundary (so "form" doesn't fire on "platform").
_FAMILY_RULES: list[tuple[str, list[str]]] = [
    ("GitHub / CI & Build", [
        "ci/cd", "ci pipeline", "pipeline failure", "build/deployment", "build error",
        "deployment error", "apps script alert", "github actions",
    ]),
    ("GitHub / Issues", [
        "github issue", "issue status", "bug issue", "human-reported bug", "bug report",
        "qa passed", "qa failed", "issues raised by qa", "dev/test github",
        "customer feedback", "feature request",
    ]),
    ("GitHub / Pull Requests", [
        "pull request", "pr update", "pr from", "prs from", r"\bpr\b", r"\bprs\b",
        "dependency update", "dependabot", "github comments from bots", "ai generated pr",
    ]),
    ("GitHub / Access & Projects", [
        "github project", "repo access", "project & access",
    ]),
    ("Alerts & Monitoring", [
        "system alert", "sentry", "monitoring alert", "keyword monitoring",
        "content monitoring", "email delivery failure", "cloud budget",
        "automated meeting record", "product update", "automated system",
    ]),
    ("Security & Auth", [
        "security", "2fa", "passcode", "credential", "account security",
        "access/credential", "compliance",
    ]),
    ("Finance & Payments", [
        "payment", "financial", "invoice", "billing", "subscription", "payroll",
        "fundraising", "investor", "grant", "insurance",
    ]),
    ("Meetings & Calendar", [
        "meeting", "standup", "okr", "planning", "calendar", "reschedule",
        "travel approval", "recap", "acceptances to internal", "declines to internal",
    ]),
    ("Documents & Forms", [
        "document", r"\bform\b", "form response", "consent", "approval", "survey",
        "documentation review", "design & ux notification", "signature",
    ]),
    ("Newsletters & Marketing", [
        "newsletter", "marketing", "industry news", "industry event", "promotion",
        "consumer marketing", "supplier newsletter", "shopping", "cart reminder",
        "mailing list",
    ]),
    ("Social & Networking", [
        "social", "linkedin", "networking", "cold outreach", "mention",
    ]),
    ("Shipping & Delivery", ["shipping", "delivery", "package", "tracking"]),
    ("People, HR & Academia", [
        r"\bhr\b", "human resources", "internship", "university", "academic",
        "phd", "reference request", "work hours", "holiday", "conference",
        "milestone", "auto responses from other people", "new team members",
    ]),
    ("Sales, Partnerships & Support", [
        "sales", "partnership", "product strategy", "positioning", "upwork",
        "contractor", "support ticket", "follow-up & chasing", "chasing replies",
    ]),
    ("Events & Competitions", [
        "competition", "professional events", "panel", "meetup", "showcase",
    ]),
    ("Media & Communications", ["media & communications", "podcast", r"\bux\b"]),
    ("Legal & IP", ["ip ownership", "legal", "intellectual property"]),
]


def _category_name(category: str) -> str:
    """The category name, lowercased, with the leading emoji and the trailing
    ' - description' / ': description' stripped off."""
    head = _SEPARATOR_RE.split(category, maxsplit=1)[0]
    return _LEADING_NON_ALNUM_RE.sub("", head.lower()).strip()


def assign_family(category: str | None) -> str:
    """Map a category (name + optional description) to its family."""
    if not category:
        return OTHER_FAMILY
    name = _category_name(category)
    for family, keywords in _FAMILY_RULES:
        for kw in keywords:
            if kw.startswith(r"\b") and kw.endswith(r"\b"):
                if re.search(kw, name):
                    return family
            elif kw in name:
                return family
    return OTHER_FAMILY


def all_families() -> list[str]:
    """The fixed list of families (plus Other), order preserved."""
    return [fam for fam, _ in _FAMILY_RULES] + [OTHER_FAMILY]
