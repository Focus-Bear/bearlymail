import { assemblePersonaEmails, CategoryPool } from "../seed-builder";
import { PersonaCategory, PersonaDataset, SeedEmailSpec } from "../seed-types";

const CATEGORIES: PersonaCategory[] = [
  {
    slug: "roadmap",
    name: "🗺️ Product & Roadmap",
    description: "Roadmap planning, prioritisation and launch coordination.",
  },
  {
    slug: "user-feedback",
    name: "💬 User Feedback",
    description: "Feature requests, complaints and customer insight.",
  },
  {
    slug: "design-ux",
    name: "🎨 Design & UX",
    description: "Design reviews, prototypes and research readouts.",
  },
  {
    slug: "eng-collab",
    name: "🛠️ Engineering Collaboration",
    description: "Specs, estimates, blockers and release coordination.",
  },
  {
    slug: "data-analytics",
    name: "📊 Data & Analytics",
    description: "Metrics, experiments and dashboards.",
  },
  {
    slug: "meetings",
    name: "📅 Meetings & Scheduling",
    description: "Calendar invites, agendas and notes.",
  },
  {
    slug: "newsletters",
    name: "📰 Newsletters",
    description: "Industry reading and product digests.",
  },
];

// Hand-authored, high-signal emails. Top-priority ones carry a real body.
const HEROES: SeedEmailSpec[] = [
  {
    fromName: "Dana Whitfield",
    fromEmail: "dana@acme.com",
    subject: "🚨 Launch blocker: checkout flow failing for 8% of users",
    categorySlug: "roadmap",
    band: "high",
    starCount: 3,
    summary:
      "QA found the new checkout flow 500s for ~8% of users on Safari; launch is at risk for Thursday unless we hotfix or roll back.",
    body: "Hi,\n\nQA just flagged a launch blocker: the new checkout flow is returning a 500 for roughly 8% of users, all on Safari 16. We're scheduled to ship Thursday.\n\nOptions as I see them:\n1) Hotfix the Safari issue (eng estimates ~1 day)\n2) Roll back to the old flow and re-launch next week\n\nCan we get 20 minutes this afternoon to decide? I'd lean toward the hotfix but want your call before I tell the wider team.\n\nThanks,\nDana",
  },
  {
    fromName: "Marcus Lin",
    fromEmail: "marcus@acme.com",
    subject: "Re: Q3 roadmap — exec review moved to tomorrow 9am",
    categorySlug: "roadmap",
    band: "high",
    starCount: 2,
    summary:
      "Exec roadmap review pulled forward to tomorrow 9am; needs the final prioritised Q3 list and the one-pager on the payments bet.",
    body: "Heads up — the exec roadmap review got moved to tomorrow at 9am. Can you have the final prioritised Q3 list ready, plus the one-pager on the payments bet? Sandra specifically asked about the ROI case. Happy to review a draft tonight if useful.\n\nMarcus",
  },
  {
    fromName: "Priya Nair",
    fromEmail: "priya@bigcorp.com",
    subject: "Enterprise customer threatening to churn over SSO gap",
    categorySlug: "user-feedback",
    band: "high",
    starCount: 2,
    summary:
      "BigCorp (top-5 account) says missing SAML SSO is a renewal blocker; their renewal is in 6 weeks and CS wants a roadmap commitment.",
    body: "Hi — escalating from the CS side. BigCorp (one of our top-5 accounts by ARR) has told us that the lack of SAML SSO is now a renewal blocker. Renewal is in 6 weeks.\n\nThey're asking for a concrete commitment: either a ship date or a credible plan. Can we talk about whether SSO can jump the queue? I know it's been parked behind the analytics work.\n\nPriya",
  },
  {
    fromName: "Tom Becker",
    fromEmail: "tom@acme.com",
    subject: "Spec review needed: notifications v2 before sprint planning",
    categorySlug: "eng-collab",
    band: "high",
    starCount: 1,
    summary:
      "Eng needs the notifications v2 spec signed off before Monday sprint planning; two open questions on digest batching and opt-out.",
    body: "Before we lock the sprint on Monday, can you review the notifications v2 spec? Two things still open:\n\n1) Digest batching window — 15 min or 1 hour?\n2) Opt-out granularity — per-category or global only?\n\nIf you can resolve these by EOD Friday we can commit the whole epic.\n\nTom",
  },
  {
    fromName: "Sandra Cole",
    fromEmail: "sandra@acme.com",
    subject: "Board deck — can you own the product section?",
    categorySlug: "roadmap",
    band: "high",
    starCount: 1,
    summary:
      "CEO asking you to own the product section of the board deck (3 slides: shipped, in-flight, next bets) by Wednesday.",
    body: "Can you own the product section of the board deck this quarter? Three slides: what we shipped, what's in flight, and the next two bets with rationale. Board meeting is next Thursday so I'd need it by Wednesday EOD. Thank you!\n\nSandra",
  },
  {
    fromName: "Elena Frost",
    fromEmail: "elena@acme.com",
    subject: "Usability test readout: onboarding drop-off at step 3",
    categorySlug: "design-ux",
    band: "high",
    summary:
      "Research found 4 of 6 users abandoned onboarding at the permissions step; recommends splitting it and deferring the calendar ask.",
    body: "Wrapped the onboarding usability sessions. Headline: 4 of 6 participants dropped at step 3 (the permissions screen) — it asks for too much at once. Recommendation: split it, and defer the calendar permission until first use. Full readout attached; can walk you through it whenever.\n\nElena",
  },
  {
    fromName: "Raj Patel",
    fromEmail: "raj@acme.com",
    subject: "A/B test result: new pricing page +12% conversion",
    categorySlug: "data-analytics",
    band: "high",
    summary:
      "Pricing page experiment hit significance: variant B +12% trial starts (p<0.01); recommends shipping to 100%.",
    body: "The pricing page A/B test reached significance. Variant B is +12% on trial starts (p<0.01) with no drop in downstream conversion. Recommendation: ship to 100%. Dashboard link in-thread.\n\nRaj",
  },
  {
    fromName: "Nina Alvarez",
    fromEmail: "nina@designco.com",
    subject: "Final mocks for the dashboard redesign — need sign-off",
    categorySlug: "design-ux",
    band: "medium",
    starCount: 1,
    summary:
      "Final dashboard redesign mocks ready for sign-off; flags one open question on mobile density.",
    body: "Final mocks for the dashboard redesign are ready for your sign-off. One open question: mobile density — do we keep the 3-card row or drop to 2 on small screens? Otherwise I think we're good to hand to eng.\n\nNina",
  },
  // Follow-ups (you sent the last message; awaiting reply)
  {
    fromName: "Product Tester",
    fromEmail: "testerbearlymail@gmail.com",
    subject: "Re: Beta feedback — following up on the export bug",
    categorySlug: "user-feedback",
    band: "medium",
    starCount: 1,
    isFollowUp: true,
    summary:
      "You followed up with the beta user about the CSV export bug and asked if the latest build fixed it — awaiting their reply.",
    body: "Hi again — just checking whether the latest build fixed the CSV export issue you hit last week? If it's still broken a screen recording would help us a lot. Thanks for being patient with this one.",
  },
  {
    fromName: "Product Tester",
    fromEmail: "testerbearlymail@gmail.com",
    subject: "Re: Roadmap input from sales — did you get my doc?",
    categorySlug: "roadmap",
    band: "medium",
    starCount: 1,
    isFollowUp: true,
    summary:
      "You sent the sales lead the roadmap-input doc and asked for their top-3 asks — awaiting reply.",
    body: "Sent over the roadmap-input doc on Monday — did it land? Mainly after your top-3 customer asks for next quarter so I can weigh them against the platform work. No rush but would love it before planning.",
  },
];

const FILLER_POOLS: CategoryPool[] = [
  {
    categorySlug: "user-feedback",
    senders: [
      { name: "Featurebase", email: "digest@featurebase.app" },
      { name: "Sam Rivera", email: "sam.rivera@gmail.com" },
      { name: "Intercom", email: "no-reply@intercom.io" },
      { name: "Olivia Chen", email: "olivia@startup.io" },
    ],
    items: [
      {
        subject: "New feature request: bulk edit for tags",
        band: "medium",
        summary:
          "A user requested bulk tag editing; 9 others upvoted the same request this week.",
      },
      {
        subject: "Complaint: app feels slow after the last update",
        band: "medium",
        summary:
          "User reports the app feels sluggish since the latest release, especially the search view.",
      },
      {
        subject: "Loving the new dashboard 🎉",
        band: "low",
        summary:
          "Positive note — a user says the redesigned dashboard is much clearer.",
      },
      {
        subject: "Can you add a dark mode?",
        band: "low",
        summary: "Recurring request for a dark theme; now 30+ upvotes.",
      },
      {
        subject: "Weekly feedback digest — 14 new ideas",
        band: "low",
        summary:
          "Featurebase digest: 14 new ideas, top one is a Slack integration with 22 votes.",
      },
    ],
  },
  {
    categorySlug: "data-analytics",
    senders: [
      { name: "Amplitude", email: "reports@amplitude.com" },
      { name: "Looker", email: "noreply@looker.com" },
      { name: "Raj Patel", email: "raj@acme.com" },
    ],
    items: [
      {
        subject: "Weekly metrics: WAU up 3.2%",
        band: "low",
        summary:
          "Weekly metrics email: WAU +3.2%, activation flat, churn down slightly.",
      },
      {
        subject: "Funnel alert: signup→activation dropped 5%",
        band: "medium",
        summary:
          "Automated funnel alert flags a 5% week-over-week drop in activation.",
      },
      {
        subject: "Your scheduled dashboard is ready",
        band: "low",
        summary: "Scheduled Looker dashboard export is ready to view.",
      },
      {
        subject: "Experiment readout: tooltip onboarding",
        band: "medium",
        summary:
          "Tooltip-onboarding experiment is inconclusive after two weeks; recommends extending.",
      },
    ],
  },
  {
    categorySlug: "meetings",
    senders: [
      { name: "Google Calendar", email: "calendar-notification@google.com" },
      { name: "Marcus Lin", email: "marcus@acme.com" },
      { name: "Otter.ai", email: "notes@otter.ai" },
    ],
    items: [
      {
        subject: "Invitation: Sprint planning @ Mon 10am",
        band: "medium",
        summary: "Calendar invite for Monday sprint planning, 10:00–11:00.",
      },
      {
        subject: "Notes ready: Product/Design sync",
        band: "low",
        summary: "Otter transcript and summary for the Product/Design sync.",
      },
      {
        subject: "Declined: 1:1 with Marcus (rescheduling)",
        band: "low",
        summary:
          "Marcus declined the 1:1 and proposed three alternative slots.",
      },
      {
        subject: "Reminder: roadmap workshop tomorrow",
        band: "medium",
        summary: "Reminder for tomorrow's cross-team roadmap workshop.",
      },
    ],
  },
  {
    categorySlug: "eng-collab",
    senders: [
      { name: "GitHub", email: "notifications@github.com" },
      { name: "Linear", email: "notifications@linear.app" },
      { name: "Tom Becker", email: "tom@acme.com" },
    ],
    items: [
      {
        subject: "PR merged: feat(notifications) digest batching",
        band: "low",
        summary: "A PR for notifications digest batching was merged to main.",
      },
      {
        subject: "Issue assigned to you: clarify acceptance criteria",
        band: "medium",
        summary:
          "Linear assigned you an issue asking for clearer acceptance criteria on the export epic.",
      },
      {
        subject: "Sprint review summary — 8 of 11 done",
        band: "low",
        summary:
          "Sprint review recap: 8 of 11 issues completed, 3 carried over.",
      },
    ],
  },
  {
    categorySlug: "newsletters",
    senders: [
      { name: "Lenny's Newsletter", email: "lenny@substack.com" },
      { name: "Mind the Product", email: "hello@mindtheproduct.com" },
      { name: "Reforge", email: "team@reforge.com" },
      { name: "Product Hunt", email: "digest@producthunt.com" },
    ],
    items: [
      {
        subject: "How the best PMs run discovery",
        band: "low",
        summary: "Newsletter essay on continuous discovery habits for PMs.",
      },
      {
        subject: "Today's top 5 product launches",
        band: "low",
        summary: "Product Hunt daily digest of the top launches.",
      },
      {
        subject: "The metrics that actually matter",
        band: "low",
        summary: "Growth newsletter on choosing a north-star metric.",
      },
      {
        subject: "Case study: pricing migrations done right",
        band: "low",
        summary: "Reforge case study on pricing migration strategy.",
      },
    ],
  },
  {
    categorySlug: "other",
    senders: [
      { name: "LinkedIn", email: "notifications@linkedin.com" },
      { name: "Notion", email: "team@makenotion.com" },
      { name: "Zoom", email: "no-reply@zoom.us" },
      { name: "Figma", email: "no-reply@figma.com" },
    ],
    items: [
      {
        subject: "You appeared in 12 searches this week",
        band: "low",
        summary: "LinkedIn notification about profile search appearances.",
      },
      {
        subject: "Someone commented on your Figma file",
        band: "low",
        summary: "A teammate left a comment on a shared Figma file.",
      },
      {
        subject: "Your Zoom cloud recording is ready",
        band: "low",
        summary: "A Zoom cloud recording has finished processing.",
      },
      {
        subject: "Weekly Notion digest",
        band: "low",
        summary: "Notion workspace activity digest for the week.",
      },
    ],
  },
];

export const PRODUCT_MANAGER: PersonaDataset = {
  key: "product-manager",
  label: "Product Manager",
  categories: CATEGORIES,
  emails: assemblePersonaEmails(HEROES, FILLER_POOLS),
};
