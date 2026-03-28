/**
 * Auto-Responder Configuration Types
 */

export interface AutoResponderConfig {
  enabled: boolean;

  // Filtering rules - which priority levels trigger responses
  sendFor: {
    standardPriority: boolean;
    highPriority: boolean;
    lowPriority: boolean;
  };

  // Custom exclusion rules - AI will interpret these to determine if email should be excluded
  customExclusionRules: string[];

  // Template customization
  templates: {
    standard: string;
    highPriority: string;
    lowPriority: string;
    noAnswer: string;
    zeroBacklog: string;
  };

  // Q&A settings
  qaContextEnabled: boolean;
  // 0-1, minimum confidence to include answer
  qaMinConfidence: number;

  // Rate limiting
  // Default: 1 per thread
  maxAutoResponsesPerSender: number;
  // Don't auto-respond to same sender within X days
  cooldownPeriodDays: number;
}

export interface EmailClassification {
  isAutomated: boolean;
  isNewsletter: boolean;
  isColdOutreach: boolean;
  isReply: boolean;
  isOutOfOffice: boolean;
  isBounce: boolean;
  // 0-1
  personalizationScore: number;
  urgencyLevel: "low" | "medium" | "high";
  reasons: string[];
}

export interface CategoryReplyTime {
  category: string;
  avgReplyTimeMinutes: number;
  repliedCount: number;
}

export interface QueueStats {
  // Emails marked for action
  actionCount: number;
  // Emails pending triage
  triageCount: number;
  // Human-readable (e.g., "~4 days")
  avgResponseTime: string;
  // For high-priority template
  urgentResponseTime: string;
  // Category-specific reply times from actual data
  categoryReplyTimes?: CategoryReplyTime[];
}

export interface QASearchResult {
  answer: string;
  confidence: number;
  sources: Array<{
    question: string;
    answer: string;
  }>;
}

export interface AutoResponseTemplateVars {
  userName: string;
  senderName: string;
  originalSubject: string;
  priorityLevel: "low" | "medium" | "high";
  actionCount: number;
  triageCount: number;
  avgResponseTime: string;
  urgentResponseTime: string;
  aiAnswer: string | null;
  hasAiAnswer: boolean;
}

export enum AutoResponseLogPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export enum SuppressionReason {
  OPT_OUT = "opt_out",
  COOLDOWN = "cooldown",
  BOUNCE = "bounce",
  MANUAL = "manual",
}

// Default templates
export const DEFAULT_TEMPLATES = {
  standard: `Hey there!

Thanks for reaching out to {{userName}}.

This is an automated response from BearlyMail, {{userName}}'s AI email assistant (think of me as an email bouncer, but I promise I'm nicer than most bouncers).

I've reviewed your email and categorized it as medium priority, which means it'll be in {{userName}}'s queue but not at the top. Currently:
- 📬 {{actionCount}} emails flagged for action
- 📋 {{triageCount}} emails still to triage
- ⏱️ Average response time for similar emails: {{avgResponseTime}}

**Want to jump the queue?** Just reply and let me know why this is time-sensitive. I'm not a monster.

{{#if hasAiAnswer}}
**Might I be helpful in the meantime?** Based on {{userName}}'s previous conversations, I think I might be able to help with your question:

{{aiAnswer}}

({{userName}} will review and confirm this when he gets to your email—I'm helpful, but I'm not autonomous yet!)
{{/if}}

{{#unless hasAiAnswer}}
**I tried to help, but...** I looked through {{userName}}'s previous emails to see if I could answer your question preemptively, but this seems like something that needs {{userName}}'s direct attention. He'll get back to you as soon as he works through the queue!
{{/unless}}

---
*You're receiving this because {{userName}} uses [BearlyMail](https://bearlymail.com) to manage email overload. If you'd prefer not to receive auto-responses, just let me know in your reply.*`,

  highPriority: `Hi!

Thanks for your email—this one caught my attention.

I'm BearlyMail, {{userName}}'s AI email assistant. I've flagged your email as high priority and moved it to the top of {{userName}}'s action queue. He should see this within the next 24 hours.

Here's what's happening:
- ⚡ Your email has been escalated
- 📊 Current queue: {{actionCount}} action items, {{triageCount}} to triage
- 🎯 Typical response time for urgent emails: {{urgentResponseTime}}

{{#if hasAiAnswer}}
**Quick answer while you wait?** Based on {{userName}}'s email history, here's what I think might help:

{{aiAnswer}}

({{userName}} will review this properly and give you a confirmed answer soon!)
{{/if}}

{{#unless hasAiAnswer}}
**I tried to help, but...** I looked through {{userName}}'s previous emails to see if I could answer your question preemptively, but this seems like something that needs {{userName}}'s direct attention. Given the urgency, he'll prioritize getting back to you!
{{/unless}}

---
*You're receiving this because {{userName}} uses [BearlyMail](https://bearlymail.com) to manage email overload. If you'd prefer not to receive auto-responses, just let me know in your reply.*`,

  lowPriority: `Hey there!

Thanks for reaching out to {{userName}}.

This is an automated response from BearlyMail, {{userName}}'s AI email assistant.

I've reviewed your email and it looks like it's not super time-sensitive, so I've placed it in the general queue. Currently:
- 📬 {{actionCount}} emails flagged for action
- 📋 {{triageCount}} emails still to triage
- ⏱️ Typical response time: {{avgResponseTime}}

If this is actually urgent, just reply and let me know—I'll bump it up!

{{#if hasAiAnswer}}
**In the meantime, this might help:**

{{aiAnswer}}

({{userName}} will review this when he gets to your email!)
{{/if}}

---
*You're receiving this because {{userName}} uses [BearlyMail](https://bearlymail.com) to manage email overload. If you'd prefer not to receive auto-responses, just let me know in your reply.*`,

  noAnswer: `**I tried to help, but...** I looked through {{userName}}'s previous emails to see if I could answer your question preemptively, but this seems like something that needs {{userName}}'s direct attention. He'll get back to you as soon as he works through the queue!`,

  zeroBacklog: `Hey there!

Thanks for reaching out to {{userName}}.

This is an automated response from BearlyMail, {{userName}}'s AI email assistant.

Good news! {{userName}}'s inbox is looking pretty clear right now, so he should be able to get back to you soon.

{{#if hasAiAnswer}}
**In the meantime, this might help:**

{{aiAnswer}}

({{userName}} will confirm this when he responds!)
{{/if}}

---
*You're receiving this because {{userName}} uses [BearlyMail](https://bearlymail.com) to manage email overload. If you'd prefer not to receive auto-responses, just let me know in your reply.*`,
};

export const DEFAULT_AUTO_RESPONDER_CONFIG: AutoResponderConfig = {
  enabled: false,
  sendFor: {
    standardPriority: true,
    highPriority: true,
    lowPriority: false,
  },
  customExclusionRules: [
    "Emails from automated systems (e.g., no-reply addresses, system notifications)",
    "Marketing newsletters and promotional emails",
    "Cold outreach that lacks genuine personalisation",
    "Obvious spam or unsolicited bulk messages",
  ],
  templates: DEFAULT_TEMPLATES,
  qaContextEnabled: true,
  qaMinConfidence: 0.7,
  maxAutoResponsesPerSender: 1,
  cooldownPeriodDays: 7,
};

export interface PreparedResponse {
  senderEmailHash: string;
  priorityLevel: "low" | "medium" | "high";
  qaResult: { answer: string; confidence: number } | null;
  templateUsed: string;
  responseBody: string;
  responseSubject: string;
  responseHtmlBody: string;
  classification: EmailClassification;
}
