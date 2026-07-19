import { assemblePersonaEmails, CategoryPool } from "../seed-builder";
import { PersonaCategory, PersonaDataset, SeedEmailSpec } from "../seed-types";

const CATEGORIES: PersonaCategory[] = [
  {
    slug: "incidents",
    name: "🚨 Incidents & Alerts",
    description: "Outages, on-call pages and monitoring alerts.",
  },
  {
    slug: "code-review",
    name: "🔧 Code Review & GitHub",
    description: "Pull requests, reviews and CI.",
  },
  {
    slug: "people",
    name: "🧑‍🤝‍🧑 People & 1:1s",
    description: "1:1s, growth, hiring and team health.",
  },
  {
    slug: "architecture",
    name: "🏗️ Architecture & Planning",
    description: "Design docs, RFCs and technical decisions.",
  },
  {
    slug: "security",
    name: "🔒 Security & Compliance",
    description: "Vulnerabilities, audits and access reviews.",
  },
  {
    slug: "vendors",
    name: "🧾 Vendors & Tooling",
    description: "Cloud bills, tool renewals and usage alerts.",
  },
  {
    slug: "newsletters",
    name: "📰 Newsletters",
    description: "Engineering reading and release notes.",
  },
];

const HEROES: SeedEmailSpec[] = [
  {
    fromName: "PagerDuty",
    fromEmail: "alerts@pagerduty.com",
    subject: "🚨 SEV-1: API error rate above 20% in us-east-1",
    categorySlug: "incidents",
    band: "high",
    starCount: 3,
    summary:
      "SEV-1 incident: API error rate spiked above 20% in us-east-1 ~10 minutes ago; on-call is paging and an incident channel is open.",
    body: "SEV-1 triggered.\n\nService: api-gateway\nRegion: us-east-1\nError rate: 22% (threshold 5%)\nStarted: ~10 min ago\n\nOn-call (Priya) has acknowledged. Incident channel #inc-2049 is open. Suspected cause: a deploy at 14:02. Recommend you join the bridge.\n\n— PagerDuty",
  },
  {
    fromName: "Priya Sharma",
    fromEmail: "priya@acme.com",
    subject: "Re: SEV-1 — rolled back, writing up the postmortem",
    categorySlug: "incidents",
    band: "high",
    starCount: 2,
    summary:
      "On-call rolled back the bad deploy and error rate is recovering; asks you to own the blameless postmortem and the action items.",
    body: "Rolled back the 14:02 deploy — error rate is back under 1% as of now. Root cause looks like an un-migrated column. I'll start the postmortem doc but can you own it and the action items? We should also talk about why the migration check didn't catch this in CI.\n\nPriya",
  },
  {
    fromName: "Sandra Cole",
    fromEmail: "sandra@acme.com",
    subject: "Headcount approved — can you open the two reqs?",
    categorySlug: "people",
    band: "high",
    starCount: 1,
    summary:
      "VP approved 2 backfill headcount for your team; needs the job descriptions and leveling finalized so recruiting can open the reqs this week.",
    body: "Good news — your two backfill reqs are approved. To get them live this week, recruiting needs the finalized JDs and leveling (one senior, one mid?). Can you send those over by Wednesday? Let me know if you want to talk through the leveling first.\n\nSandra",
  },
  {
    fromName: "GitHub",
    fromEmail: "notifications@github.com",
    subject: "Review requested: RFC — migrate to event-driven sync",
    categorySlug: "architecture",
    band: "high",
    starCount: 1,
    summary:
      "A staff engineer requested your review on the RFC to move email sync from polling to event-driven; decision needed before next sprint.",
    body: "@you was requested for review on PR #2087: 'RFC: migrate email sync to event-driven'.\n\nThe author wants a decision before next sprint so the team can plan. Main open question is whether to use SNS/SQS or a managed event bus. Two engineers have already approved.",
  },
  {
    fromName: "Snyk",
    fromEmail: "alerts@snyk.io",
    subject: "🔒 Critical vulnerability in a direct dependency",
    categorySlug: "security",
    band: "high",
    starCount: 1,
    summary:
      "Snyk flagged a critical RCE in a direct dependency used in production; a patched version is available and a fix PR was auto-opened.",
    body: "A new critical vulnerability (CVSS 9.8, potential RCE) was found in a direct dependency that ships to production. A patched version is available and we've auto-opened a fix PR. Recommend prioritising the upgrade and a deploy today.\n\n— Snyk",
  },
  {
    fromName: "Datadog",
    fromEmail: "alerts@datadoghq.com",
    subject: "Monitor: p99 latency degraded on checkout service",
    categorySlug: "incidents",
    band: "high",
    summary:
      "Datadog monitor warns p99 latency on the checkout service has crept from 300ms to 1.2s over 24h — not yet paging but trending badly.",
    body: "Warning (not yet critical): p99 latency on checkout-service has risen from ~300ms to ~1.2s over the last 24 hours. No SLO breach yet but the trend is bad. Likely a slow query — dashboard link in-thread.\n\n— Datadog",
  },
  {
    fromName: "AWS",
    fromEmail: "no-reply@aws.amazon.com",
    subject: "Cost anomaly detected: +38% on data transfer",
    categorySlug: "vendors",
    band: "medium",
    starCount: 1,
    summary:
      "AWS cost-anomaly alert: data-transfer spend is up 38% week-over-week, concentrated in one account; worth investigating before the bill lands.",
    body: "Cost anomaly detected.\n\nService: Data Transfer\nChange: +38% WoW\nAccount: prod-2\n\nThis is likely a chatty cross-AZ path or a missing CDN cache rule. Worth a look before month-end billing.\n\n— AWS Cost Anomaly Detection",
  },
  {
    fromName: "Eng Manager",
    fromEmail: "testerbearlymail@gmail.com",
    subject: "Re: 1:1 prep — your growth goals for the half",
    categorySlug: "people",
    band: "medium",
    starCount: 1,
    isFollowUp: true,
    summary:
      "You asked a report to jot down their growth goals before your 1:1 — awaiting their notes.",
    body: "For our 1:1 Thursday, could you jot down a couple of growth goals for the half? Mainly want to make sure I'm giving you the right kind of projects. Doesn't need to be polished — bullets are perfect.",
  },
  {
    fromName: "Eng Manager",
    fromEmail: "testerbearlymail@gmail.com",
    subject: "Re: Postmortem review — does Tuesday work?",
    categorySlug: "incidents",
    band: "medium",
    starCount: 1,
    isFollowUp: true,
    summary:
      "You proposed a time to review the SEV-1 postmortem with the team — awaiting confirmation.",
    body: "Proposing we review the SEV-1 postmortem together Tuesday at 3pm — 30 minutes, blameless, focused on the CI gap that let the migration through. Does that time work for everyone? Reply with a thumbs up or a better slot.",
  },
];

const FILLER_POOLS: CategoryPool[] = [
  {
    categorySlug: "code-review",
    senders: [
      { name: "GitHub", email: "notifications@github.com" },
      { name: "Linear", email: "notifications@linear.app" },
      { name: "CircleCI", email: "builds@circleci.com" },
      { name: "Dependabot", email: "noreply@github.com" },
    ],
    items: [
      {
        subject: "Review requested: fix(auth) refresh-token rotation",
        band: "medium",
        summary:
          "A teammate requested your review on an auth refresh-token PR.",
      },
      {
        subject: "CI failed on main: 3 tests flaky",
        band: "medium",
        summary: "A CI run on main failed with three flaky tests in the suite.",
      },
      {
        subject: "PR approved and merged",
        band: "low",
        summary: "One of your PRs was approved and merged to main.",
      },
      {
        subject: "Dependabot: bump lodash 4.17.20 → 4.17.21",
        band: "low",
        summary: "Dependabot opened a routine patch-bump PR.",
      },
      {
        subject: "Stale PR reminder: open for 9 days",
        band: "low",
        summary: "Reminder that a PR has been open without review for 9 days.",
      },
    ],
  },
  {
    categorySlug: "incidents",
    senders: [
      { name: "Datadog", email: "alerts@datadoghq.com" },
      { name: "PagerDuty", email: "alerts@pagerduty.com" },
      { name: "Sentry", email: "alerts@sentry.io" },
    ],
    items: [
      {
        subject: "Resolved: monitor recovered on worker queue",
        band: "low",
        summary:
          "A previously-warning monitor on the worker queue has recovered.",
      },
      {
        subject: "New error spike in production",
        band: "medium",
        summary: "Sentry detected a new error spike affecting ~120 sessions.",
      },
      {
        subject: "On-call handoff summary",
        band: "low",
        summary: "End-of-rotation on-call handoff summary with two follow-ups.",
      },
    ],
  },
  {
    categorySlug: "people",
    senders: [
      { name: "Lattice", email: "no-reply@lattice.com" },
      { name: "Greenhouse", email: "no-reply@greenhouse.io" },
      { name: "Sandra Cole", email: "sandra@acme.com" },
    ],
    items: [
      {
        subject: "Reminder: submit peer feedback by Friday",
        band: "medium",
        summary:
          "Lattice reminder that review-cycle peer feedback is due Friday.",
      },
      {
        subject: "Interview scheduled: Backend candidate, Wed 2pm",
        band: "low",
        summary: "A backend interview was scheduled for Wednesday at 2pm.",
      },
      {
        subject: "1:1 notes shared with you",
        band: "low",
        summary: "A report shared their 1:1 notes doc with you.",
      },
    ],
  },
  {
    categorySlug: "architecture",
    senders: [
      { name: "Notion", email: "team@makenotion.com" },
      { name: "Confluence", email: "no-reply@atlassian.com" },
      { name: "Staff Eng", email: "deepak@acme.com" },
    ],
    items: [
      {
        subject: "Design doc comment: caching strategy",
        band: "medium",
        summary: "A teammate commented on the caching-strategy design doc.",
      },
      {
        subject: "RFC published: standardise error handling",
        band: "low",
        summary: "A new RFC on standardising error handling was published.",
      },
      {
        subject: "Tech-debt backlog grooming notes",
        band: "low",
        summary: "Notes from the tech-debt grooming session are available.",
      },
    ],
  },
  {
    categorySlug: "security",
    senders: [
      { name: "Snyk", email: "alerts@snyk.io" },
      { name: "1Password", email: "no-reply@1password.com" },
      { name: "Vanta", email: "no-reply@vanta.com" },
    ],
    items: [
      {
        subject: "Weekly vulnerability summary",
        band: "low",
        summary: "Snyk weekly summary: 2 medium, 5 low across repos.",
      },
      {
        subject: "Access review due for SOC 2",
        band: "medium",
        summary: "Vanta flags a quarterly access review due for SOC 2.",
      },
      {
        subject: "Reminder: rotate the shared deploy key",
        band: "low",
        summary: "Reminder to rotate a shared deploy key past its policy age.",
      },
    ],
  },
  {
    categorySlug: "vendors",
    senders: [
      { name: "AWS", email: "no-reply@aws.amazon.com" },
      { name: "Vercel", email: "no-reply@vercel.com" },
      { name: "Datadog Billing", email: "billing@datadoghq.com" },
    ],
    items: [
      {
        subject: "Your AWS bill is available — $14,210",
        band: "low",
        summary: "Monthly AWS bill is available for review.",
      },
      {
        subject: "Plan usage at 85% for the month",
        band: "low",
        summary: "A vendor warns you're at 85% of the monthly plan usage.",
      },
      {
        subject: "Renewal notice: observability plan",
        band: "medium",
        summary: "An observability vendor's annual plan renews in 14 days.",
      },
    ],
  },
  {
    categorySlug: "newsletters",
    senders: [
      {
        name: "The Pragmatic Engineer",
        email: "gergely@pragmaticengineer.com",
      },
      { name: "InfoQ", email: "news@infoq.com" },
      { name: "Hacker Newsletter", email: "kale@hackernewsletter.com" },
    ],
    items: [
      {
        subject: "How top teams do on-call",
        band: "low",
        summary: "Newsletter deep-dive on healthy on-call practices.",
      },
      {
        subject: "This week in distributed systems",
        band: "low",
        summary: "Curated reading on distributed-systems topics.",
      },
      {
        subject: "Postmortem culture that works",
        band: "low",
        summary: "Essay on building a blameless postmortem culture.",
      },
    ],
  },
  {
    categorySlug: "other",
    senders: [
      { name: "LinkedIn", email: "notifications@linkedin.com" },
      { name: "Zoom", email: "no-reply@zoom.us" },
      { name: "Slack", email: "feedback@slack.com" },
    ],
    items: [
      {
        subject: "You have 3 new connection requests",
        band: "low",
        summary: "LinkedIn notification about pending connection requests.",
      },
      {
        subject: "Your meeting recording is ready",
        band: "low",
        summary: "A Zoom cloud recording finished processing.",
      },
      {
        subject: "Reminder set in #eng-leads",
        band: "low",
        summary: "Slack reminder you set in the eng-leads channel fired.",
      },
    ],
  },
];

export const ENGINEERING_MANAGER: PersonaDataset = {
  key: "engineering-manager",
  label: "Engineering Manager",
  categories: CATEGORIES,
  emails: assemblePersonaEmails(HEROES, FILLER_POOLS),
};
