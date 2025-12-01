import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailsService } from '../emails/emails.service';
import { LLMService } from '../llm/llm.service';
import { SummarizationRule as SummarizationRuleEntity } from '../database/entities/summarization-rule.entity';

export interface SummarizationRule {
  type: 'bullet-points' | 'action-items' | 'sender-request' | 'tldr' | 'custom';
  customPrompt?: string;
  provider?: 'gemini' | 'openai';
}

@Injectable()
export class SummarizationService {
  constructor(
    private emailsService: EmailsService,
    private llmService: LLMService,
    @InjectRepository(SummarizationRuleEntity)
    private summarizationRuleRepository: Repository<SummarizationRuleEntity>,
  ) {}

  async summarizeEmail(
    userId: string,
    emailId: string,
    rule: SummarizationRule,
  ): Promise<string> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error('Email not found');
    }

    // For thread summaries, get the last 3 messages in the thread (need body for summarization)
    const threadEmails = await this.emailsService.getThreadEmails(userId, email.threadId);
    const last3Messages = threadEmails
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
      .slice(0, 3)
      .reverse(); // Reverse to get chronological order (oldest to newest)

    // Combine the last 3 messages for thread context
    const threadText = last3Messages
      .map((e, idx) => {
        const sender = e.fromName || e.from;
        const date = new Date(e.receivedAt).toLocaleString();
        return `[Message ${idx + 1} from ${sender} on ${date}]:\n${e.body || ''}`;
      })
      .join('\n\n---\n\n');
    
    const subject = email.subject || '';
    const text = threadText || email.body || '';

    // Use LLM for all summarization types
    try {
      const provider = rule.provider 
        ? (rule.provider === 'gemini' ? 'gemini' : 'openai')
        : undefined;

      if (rule.type === 'custom' && rule.customPrompt) {
        // Custom prompt using LLM
        const prompt = last3Messages.length > 1
          ? `Email Thread Subject: ${subject}\n\nThis thread contains ${last3Messages.length} messages. Here are the last ${Math.min(3, last3Messages.length)} messages:\n\n${threadText}\n\n${rule.customPrompt}`
          : `Email Subject: ${subject}\n\nEmail Body:\n${email.body || ''}\n\n${rule.customPrompt}`;
        
        return await this.llmService.generateText({
          prompt,
          systemPrompt: 'You are a helpful assistant that summarizes email threads according to user instructions.',
          temperature: 0.5,
          maxTokens: 500,
          userId,
        }, provider as any, userId);
      }

      // Use LLM for standard summarization types
      if (last3Messages.length > 1) {
        // Thread summary - use specialized prompt
        return await this.llmService.summarizeEmail(
          threadText,
          subject,
          rule.type,
          provider as any,
          userId,
        );
      } else {
        // Single email summary
        return await this.llmService.summarizeEmail(
          email.body || '',
          subject,
          rule.type,
          provider as any,
          userId,
        );
      }
    } catch (error) {
      // Fallback to simple extraction if LLM fails
      console.error('LLM summarization failed, using fallback', error);
      return this.fallbackSummary(text, subject, rule.type, email.from);
    }
  }

  async getSummarizationRules(userId: string): Promise<SummarizationRuleEntity[]> {
    return this.summarizationRuleRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async createSummarizationRule(
    userId: string,
    rule: { whenToUse: string; howToSummarize: string },
  ): Promise<SummarizationRuleEntity> {
    const newRule = this.summarizationRuleRepository.create({
      ...rule,
      userId,
    });
    return this.summarizationRuleRepository.save(newRule);
  }

  async updateSummarizationRule(
    userId: string,
    ruleId: string,
    updates: { whenToUse?: string; howToSummarize?: string },
  ): Promise<SummarizationRuleEntity> {
    await this.summarizationRuleRepository.update({ ruleId, userId }, updates);
    return this.summarizationRuleRepository.findOne({ where: { ruleId, userId } });
  }

  async deleteSummarizationRule(userId: string, ruleId: string): Promise<void> {
    await this.summarizationRuleRepository.delete({ ruleId, userId });
  }

  private fallbackSummary(
    text: string,
    subject: string,
    type: string,
    sender: string,
  ): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    switch (type) {
      case 'bullet-points':
        return sentences
          .slice(0, 5)
          .map((s) => `• ${s.trim()}`)
          .join('\n') || '• No key points found';
      case 'action-items':
        const actionKeywords = ['please', 'need', 'should', 'must', 'action', 'do', 'complete'];
        const actionSentences = sentences
          .filter((s) => actionKeywords.some((keyword) => s.toLowerCase().includes(keyword)))
          .slice(0, 5)
          .map((s) => `• ${s.trim()}`)
          .join('\n');
        return actionSentences || '• No action items found';
      case 'sender-request':
        return `From ${sender}: ${sentences[0]?.trim() || 'No specific request found.'}`;
      case 'tldr':
      default:
        const summary = sentences[0]?.substring(0, 200) || text.substring(0, 200);
        return `TL;DR: ${summary}${summary.length >= 200 ? '...' : ''}`;
    }
  }
}
