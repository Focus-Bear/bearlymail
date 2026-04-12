/**
 * Pure helper functions extracted from AutoResponderPreview.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

export interface QueueStats {
  actionCount: number;
  triageCount: number;
  avgResponseTime: string;
  urgentResponseTime: string;
}

export type TemplateKey = 'standard' | 'highPriority' | 'lowPriority';

export interface TemplatePreview {
  label: string;
  emoji: string;
  body: string;
}

export function getFirstName(fullName: string | undefined): string {
  if (!fullName) {
    return 'the user';
  }
  const firstName = fullName.split(' ')[0];
  return firstName || fullName;
}

export function buildTemplatePreviews(firstName: string, stats: QueueStats): Record<TemplateKey, TemplatePreview> {
  return {
    standard: {
      label: 'Standard Priority',
      emoji: '📬',
      body: `Hey there!

Thanks for reaching out.

This is an automated response from BearlyMail, ${firstName}'s AI email assistant (think of me as an email bouncer, but I promise I'm nicer than most bouncers).

I've reviewed your email and categorized it as medium priority, which means it'll be in the queue but not at the top. ${firstName} has quite a few other emails to deal with:
- 📬 ${stats.actionCount > 100 ? '100+' : stats.actionCount} emails flagged for action
- 📋 ${stats.triageCount > 100 ? '100+' : stats.triageCount} emails still to triage
- ⏱️ Average response time for similar emails: ${stats.avgResponseTime}

**Want to jump the queue?** Just reply and let me know why this is time-sensitive. I'm not a monster.

**Might I be helpful in the meantime?** Based on the Q&A in your context, I think I might be able to help with your question:

_[AI-generated answer would appear here based on your Q&A context]_

---
*If you'd like help prioritising your inbox, check out [BearlyMail](https://bearlymail.com)*`,
    },
    highPriority: {
      label: 'High Priority',
      emoji: '🔥',
      body: `Hi!

Thanks for your email—this one caught my attention.

I'm BearlyMail, ${firstName}'s AI email assistant. I've flagged your email as high priority and moved it to the top of the action queue. You should see a response within the next 24 hours.

Here's what's happening:
- ⚡ Your email has been escalated
- 📊 Current queue: ${stats.actionCount} action items, ${stats.triageCount} to triage
- 🎯 Typical response time for urgent emails: ${stats.urgentResponseTime}

---
*If you'd like help prioritising your inbox, check out [BearlyMail](https://bearlymail.com)*`,
    },
    lowPriority: {
      label: 'Low Priority',
      emoji: '📭',
      body: `Hey there!

Thanks for reaching out.

This is an automated response from BearlyMail.

I've reviewed your email and it looks like it's not super time-sensitive, so I've placed it in the general queue. ${firstName} has quite a few other emails to deal with:
- 📬 ${stats.actionCount} emails flagged for action
- 📋 ${stats.triageCount} emails still to triage
- ⏱️ Typical response time: ${stats.avgResponseTime}

If this is actually urgent, just reply and let me know—I'll bump it up!

---
*If you'd like help prioritising your inbox, check out [BearlyMail](https://bearlymail.com)*`,
    },
  };
}
