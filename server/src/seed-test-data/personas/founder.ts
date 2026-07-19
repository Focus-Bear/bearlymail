import { assemblePersonaEmails, CategoryPool } from "../seed-builder";
import { PersonaCategory, PersonaDataset, SeedEmailSpec } from "../seed-types";

const CATEGORIES: PersonaCategory[] = [
  {
    slug: "investors",
    name: "💸 Investors & Fundraising",
    description: "Investor updates, term sheets and intros.",
  },
  {
    slug: "sales",
    name: "🤝 Sales & Customers",
    description: "Deals, renewals and key-account escalations.",
  },
  {
    slug: "hiring",
    name: "🧑‍💼 Hiring",
    description: "Candidates, offers and recruiter threads.",
  },
  {
    slug: "finance-legal",
    name: "📑 Finance & Legal",
    description: "Runway, contracts, invoices and compliance.",
  },
  {
    slug: "team",
    name: "👥 Team & Ops",
    description: "Internal updates, all-hands and people topics.",
  },
  {
    slug: "press",
    name: "📣 Press & Marketing",
    description: "Press requests, podcasts and brand.",
  },
  {
    slug: "newsletters",
    name: "📰 Newsletters",
    description: "Founder reading and market intel.",
  },
];

const HEROES: SeedEmailSpec[] = [
  {
    fromName: "Catherine Wu",
    fromEmail: "catherine@sequoiaesque.vc",
    subject: "Term sheet attached — let's talk timing",
    categorySlug: "investors",
    band: "high",
    starCount: 3,
    summary:
      "Lead investor sent the term sheet for the Series A; wants a call this week on valuation and the option-pool top-up before it expires Friday.",
    body: "Hi,\n\nGreat to meet the team last week — we're excited. Term sheet is attached. Headline: $8M at the range we discussed, standard 1x non-participating. Two things to align on: the option-pool top-up (we've penciled 12% post) and board composition.\n\nThe sheet is open until Friday. Can we grab 30 minutes tomorrow? Want to make this easy for you.\n\nBest,\nCatherine",
  },
  {
    fromName: "David Osei",
    fromEmail: "david@globex.com",
    subject: "🔴 Globex renewal at risk — need founder on a call",
    categorySlug: "sales",
    band: "high",
    starCount: 3,
    summary:
      "Largest customer (Globex, ~18% of ARR) is wavering on renewal over reliability concerns; their VP wants to hear from the founder directly.",
    body: "Flagging this directly. Globex — our biggest account, ~18% of ARR — is hesitating on renewal. Their VP cited the two outages last quarter. He's asked to speak with a founder before they commit.\n\nI think a 30-minute call where you own the reliability story (what happened, what we changed) saves this. Renewal date is the 30th. Can you do Thursday?\n\nDavid",
  },
  {
    fromName: "Aisha Rahman",
    fromEmail: "aisha@acme.com",
    subject: "Payroll won't clear without the signed amendment",
    categorySlug: "finance-legal",
    band: "high",
    starCount: 2,
    summary:
      "Finance needs your signature on the banking amendment today or payroll won't run on Friday; DocuSign link in-thread.",
    body: "Hi — time-sensitive. The bank needs the signed account amendment before they'll process Friday's payroll. I've sent it via DocuSign (link below). It's a 2-minute signature but it must be today. Sorry for the fire drill.\n\nAisha",
  },
  {
    fromName: "Jordan Mehta",
    fromEmail: "jordan@techcrunch.com",
    subject: "TechCrunch — interested in covering your raise",
    categorySlug: "press",
    band: "high",
    starCount: 1,
    summary:
      "TechCrunch reporter wants to cover the funding round; offering an exclusive if they can talk this week, with an embargo to your launch date.",
    body: "Hi — I cover early-stage SaaS for TechCrunch. Heard you're closing a round. I'd love to write it up and can offer an exclusive if we talk this week. Happy to embargo to your preferred date. 20 minutes any time Wed/Thu?\n\nJordan",
  },
  {
    fromName: "Lena Fischer",
    fromEmail: "lena@talentloop.com",
    subject: "Strong VP Eng candidate — available to meet Thursday",
    categorySlug: "hiring",
    band: "high",
    starCount: 1,
    summary:
      "Recruiter has a VP Eng candidate (ex-Stripe, scaled a team 5→40) who's interviewing elsewhere; wants to fast-track a founder chat Thursday.",
    body: "I think I've found your VP Eng. Ex-Stripe, scaled a platform team from 5 to 40, strong on reliability — exactly your gap. He's in final rounds elsewhere so timing matters. Could you do a 30-minute founder chat Thursday? I'd hate to lose him to a slower process.\n\nLena",
  },
  {
    fromName: "Sofia Marchetti",
    fromEmail: "sofia@angellist-investor.com",
    subject: "Quick intro — happy to invest in the round",
    categorySlug: "investors",
    band: "medium",
    starCount: 1,
    summary:
      "Angel investor (operator-turned-angel) wants to put $100k into the round and offers customer intros in fintech.",
    body: "Loved what I saw at the demo day. I'd like to put in $100k if there's room in the round, and I can open doors with a few fintech buyers I know well. Let me know if the round is still open.\n\nSofia",
  },
  {
    fromName: "Founder",
    fromEmail: "testerbearlymail@gmail.com",
    subject: "Re: Reference check on the VP Eng candidate",
    categorySlug: "hiring",
    band: "medium",
    starCount: 1,
    isFollowUp: true,
    summary:
      "You asked the candidate's former manager for a reference call — awaiting a time.",
    body: "Hi — thanks again for offering to be a reference for [candidate]. Could you do a 20-minute call this week? Mainly want to understand how he handled the reliability turnaround at your last company. Any time works on my side.",
  },
  {
    fromName: "Founder",
    fromEmail: "testerbearlymail@gmail.com",
    subject: "Re: Monthly investor update — any questions?",
    categorySlug: "investors",
    band: "low",
    starCount: 1,
    isFollowUp: true,
    summary:
      "You sent the monthly investor update and asked if anyone had questions — awaiting replies.",
    body: "Sent out the October investor update this morning. TL;DR: revenue +14% MoM, two enterprise logos signed, hiring a VP Eng. Reply here if anything's unclear or you want to dig into a number.",
  },
];

const FILLER_POOLS: CategoryPool[] = [
  {
    categorySlug: "sales",
    senders: [
      { name: "HubSpot", email: "no-reply@hubspot.com" },
      { name: "Marcus Reed", email: "marcus.reed@prospect.com" },
      { name: "Calendly", email: "notifications@calendly.com" },
      { name: "Tara Singh", email: "tara@midmarket.io" },
    ],
    items: [
      {
        subject: "New demo booked for Tuesday",
        band: "medium",
        summary: "A qualified prospect booked a product demo for Tuesday.",
      },
      {
        subject: "Deal stage update: Acme moved to negotiation",
        band: "medium",
        summary: "CRM update: the Acme deal advanced to the negotiation stage.",
      },
      {
        subject: "Following up on our chat last week",
        band: "low",
        summary: "A prospect is nudging for next steps after last week's call.",
      },
      {
        subject: "Renewal reminder: Initech in 30 days",
        band: "medium",
        summary: "Automated reminder that the Initech renewal is 30 days out.",
      },
    ],
  },
  {
    categorySlug: "finance-legal",
    senders: [
      { name: "Stripe", email: "no-reply@stripe.com" },
      { name: "Brex", email: "team@brex.com" },
      { name: "Ramp", email: "notifications@ramp.com" },
      { name: "Carta", email: "no-reply@carta.com" },
    ],
    items: [
      {
        subject: "Your invoice is ready — $4,920",
        band: "low",
        summary: "A vendor invoice for $4,920 is ready and will auto-charge.",
      },
      {
        subject: "Card statement available",
        band: "low",
        summary: "Monthly corporate card statement is available to review.",
      },
      {
        subject: "Cap table updated after SAFE conversion",
        band: "medium",
        summary:
          "Carta notification that the cap table updated after a SAFE converted.",
      },
      {
        subject: "Runway alert: 9 months at current burn",
        band: "medium",
        summary:
          "Finance tool flags ~9 months of runway at the current burn rate.",
      },
    ],
  },
  {
    categorySlug: "hiring",
    senders: [
      { name: "Ashby", email: "no-reply@ashbyhq.com" },
      { name: "LinkedIn Recruiter", email: "recruiter@linkedin.com" },
      { name: "Greenhouse", email: "no-reply@greenhouse.io" },
    ],
    items: [
      {
        subject: "New application: Senior Backend Engineer",
        band: "low",
        summary:
          "A new candidate applied for the Senior Backend Engineer role.",
      },
      {
        subject: "Interview feedback submitted",
        band: "low",
        summary: "An interviewer submitted feedback for a pipeline candidate.",
      },
      {
        subject: "Candidate accepted your offer 🎉",
        band: "medium",
        summary:
          "A candidate accepted the offer for the Account Executive role.",
      },
    ],
  },
  {
    categorySlug: "team",
    senders: [
      { name: "Aisha Rahman", email: "aisha@acme.com" },
      { name: "Slack", email: "feedback@slack.com" },
      { name: "Notion", email: "team@makenotion.com" },
    ],
    items: [
      {
        subject: "All-hands agenda for Friday",
        band: "low",
        summary: "Draft agenda circulated for Friday's all-hands.",
      },
      {
        subject: "Someone mentioned you in #leadership",
        band: "low",
        summary: "You were mentioned in the #leadership Slack channel.",
      },
      {
        subject: "Q3 OKR check-in due",
        band: "medium",
        summary: "Reminder that the quarterly OKR check-in is due this week.",
      },
    ],
  },
  {
    categorySlug: "press",
    senders: [
      { name: "Podcast Booking", email: "bookings@saaspod.fm" },
      { name: "PR Agency", email: "team@launchpr.com" },
    ],
    items: [
      {
        subject: "Podcast invite: founder journey episode",
        band: "low",
        summary:
          "A SaaS podcast invites you on to discuss the founder journey.",
      },
      {
        subject: "Draft press release for your review",
        band: "low",
        summary: "PR agency shared a draft press release for the raise.",
      },
    ],
  },
  {
    categorySlug: "newsletters",
    senders: [
      { name: "First Round Review", email: "review@firstround.com" },
      { name: "SaaStr", email: "jason@saastr.com" },
      { name: "Stratechery", email: "ben@stratechery.com" },
      { name: "The Generalist", email: "mario@generalist.com" },
    ],
    items: [
      {
        subject: "What we learned scaling to $10M ARR",
        band: "low",
        summary: "Newsletter essay on the path from $1M to $10M ARR.",
      },
      {
        subject: "The state of SaaS fundraising in 2026",
        band: "low",
        summary: "Market intel on the current fundraising environment.",
      },
      {
        subject: "How great founders run their week",
        band: "low",
        summary: "Productivity piece on founder time management.",
      },
    ],
  },
  {
    categorySlug: "other",
    senders: [
      { name: "LinkedIn", email: "notifications@linkedin.com" },
      { name: "Zoom", email: "no-reply@zoom.us" },
      { name: "DocuSign", email: "dse@docusign.net" },
    ],
    items: [
      {
        subject: "Your post got 240 impressions",
        band: "low",
        summary: "LinkedIn analytics on a recent post's reach.",
      },
      {
        subject: "Document completed: NDA",
        band: "low",
        summary: "A DocuSign envelope (NDA) completed all signatures.",
      },
      {
        subject: "Your Zoom recording is ready",
        band: "low",
        summary: "A Zoom cloud recording finished processing.",
      },
    ],
  },
];

export const FOUNDER: PersonaDataset = {
  key: "founder",
  label: "Founder",
  categories: CATEGORIES,
  emails: assemblePersonaEmails(HEROES, FILLER_POOLS),
};
