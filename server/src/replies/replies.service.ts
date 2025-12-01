import { Injectable } from '@nestjs/common';
import { EmailsService } from '../emails/emails.service';
import { EmailProviderManager } from '../emails/email-provider-manager.service';
import { ContextService } from '../context/context.service';
import { LLMService } from '../llm/llm.service';
import { ContextKey } from '../database/entities/user-context.entity';
import { Email } from '../database/entities/email.entity';

export interface ReplyRule {
  ruleId?: string;
  trigger: string; // e.g., "subject contains 'meeting'"
  template: string; // Reply template
  priority: number;
}

@Injectable()
export class RepliesService {
  private replyRules: Map<string, ReplyRule[]> = new Map();

  constructor(
    private emailsService: EmailsService,
    private emailProviderManager: EmailProviderManager,
    private contextService: ContextService,
    private llmService: LLMService,
  ) {}

  async generateDraftReply(
    userId: string,
    emailId: string,
    provider?: 'gemini' | 'openai',
  ): Promise<string> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error('Email not found');
    }

    // Get user context
    const contexts = await this.contextService.getUserContext(userId);
    const tone = contexts.find((c) => c.contextKey === ContextKey.WRITING_STYLE_TONE)?.contextValue || 'professional';
    const commonPhrases = contexts
      .filter((c) => c.contextKey === ContextKey.COMMON_PHRASE)
      .map((c) => c.contextValue);
    const writingStyle = contexts
      .find((c) => c.contextKey === ContextKey.WRITING_STYLE_TONE)?.contextValue;

    // Check for matching reply rules first
    const rules = this.replyRules.get(userId) || [];
    const matchingRule = rules.find((rule) => this.matchesTrigger(email, rule.trigger));

    if (matchingRule) {
      // Use rule template but enhance with LLM if needed
      const baseReply = this.applyTemplate(matchingRule.template, email, tone, commonPhrases);
      // Could optionally refine with LLM here
      return baseReply;
    }

    // Use LLM to generate reply
    try {
      return await this.llmService.generateReplyDraft(
        {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        },
        {
          tone,
          commonPhrases,
          writingStyle,
        },
        provider as any,
        userId,
      );
    } catch (error) {
      console.error('LLM reply generation failed, using fallback', error);
      // Fallback to default reply
      return this.generateDefaultReply(email, tone, commonPhrases);
    }
  }

  private matchesTrigger(email: Partial<Email>, trigger: string): boolean {
    if (trigger.includes('subject contains')) {
      const keyword = trigger.split("'")[1];
      return email.subject?.toLowerCase().includes(keyword.toLowerCase()) || false;
    }
    if (trigger.includes('from contains')) {
      const keyword = trigger.split("'")[1];
      return email.from?.toLowerCase().includes(keyword.toLowerCase()) || false;
    }
    return false;
  }

  private applyTemplate(
    template: string,
    email: Partial<Email>,
    tone: string,
    phrases: string[],
  ): string {
    let reply = template
      .replace('{sender}', email.fromName || email.from || 'there')
      .replace('{subject}', email.subject || '');

    // Add greeting based on tone
    const greeting = tone === 'casual' ? 'Hey' : tone === 'formal' ? 'Dear' : 'Hi';
    reply = `${greeting} ${email.fromName || 'there'},\n\n${reply}`;

    return reply;
  }

  private generateDefaultReply(
    email: Partial<Email>,
    tone: string,
    phrases: string[],
  ): string {
    const greeting = tone === 'casual' ? 'Hey' : tone === 'formal' ? 'Dear' : 'Hi';
    const closing = tone === 'casual' ? 'Thanks!' : tone === 'formal' ? 'Best regards' : 'Best';

    return `${greeting} ${email.fromName || 'there'},

Thank you for your email regarding "${email.subject || 'this matter'}".

I'll review this and get back to you soon.

${closing}`;
  }

  async createReplyRule(userId: string, rule: ReplyRule): Promise<ReplyRule> {
    const rules = this.replyRules.get(userId) || [];
    rule.ruleId = `${Date.now()}-${Math.random()}`; // Simple ID generation
    rules.push(rule);
    this.replyRules.set(userId, rules);
    return rule;
  }

  async getReplyRules(userId: string): Promise<ReplyRule[]> {
    return this.replyRules.get(userId) || [];
  }

  async updateReplyRule(userId: string, ruleId: string, updates: Partial<ReplyRule>): Promise<ReplyRule> {
    const rules = this.replyRules.get(userId) || [];
    const index = rules.findIndex((r) => r.ruleId === ruleId);
    if (index !== -1) {
      rules[index] = { ...rules[index], ...updates };
      this.replyRules.set(userId, rules);
      return rules[index];
    }
    throw new Error('Rule not found');
  }

  async deleteReplyRule(userId: string, ruleId: string): Promise<void> {
    const rules = this.replyRules.get(userId) || [];
    const filtered = rules.filter((r) => r.ruleId !== ruleId);
    this.replyRules.set(userId, filtered);
  }

  async learnFromModification(
    userId: string,
    emailId: string,
    originalDraft: string,
    modifiedDraft: string,
  ): Promise<ReplyRule> {
    // Analyze the modification to create a new rule
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error('Email not found');
    }

    // Simple rule generation based on email characteristics
    const trigger = `subject contains '${email.subject.split(' ')[0]}'`;
    const rule: ReplyRule = {
      trigger,
      template: modifiedDraft,
      priority: 1,
    };

    return this.createReplyRule(userId, rule);
  }

  async sendReply(
    userId: string,
    emailId: string,
    body: string,
  ): Promise<void> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error('Email not found');
    }

    // Determine reply subject (add Re: if not already present)
    let replySubject = email.subject;
    if (!replySubject.toLowerCase().startsWith('re:')) {
      replySubject = `Re: ${replySubject}`;
    }

    // Send reply via email provider (Gmail, Outlook, etc.)
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error('No email provider connected. Please connect your email account.');
    }

    await provider.sendReply(
      userId,
      email.threadId,
      email.from,
      replySubject,
      body,
    );
  }
}

