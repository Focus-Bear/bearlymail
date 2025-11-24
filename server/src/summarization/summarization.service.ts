import { Injectable } from '@nestjs/common';
import { EmailsService } from '../emails/emails.service';
import { LLMService } from '../llm/llm.service';

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
  ) {}

  async summarizeEmail(
    userId: number,
    emailId: number,
    rule: SummarizationRule,
  ): Promise<string> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error('Email not found');
    }

    const text = email.body || '';
    const subject = email.subject || '';

    // Use LLM for all summarization types
    try {
      const provider = rule.provider 
        ? (rule.provider === 'gemini' ? 'gemini' : 'openai')
        : undefined;

      if (rule.type === 'custom' && rule.customPrompt) {
        // Custom prompt using LLM
        return await this.llmService.generateText({
          prompt: `Email Subject: ${subject}\n\nEmail Body:\n${text}\n\n${rule.customPrompt}`,
          systemPrompt: 'You are a helpful assistant that summarizes emails according to user instructions.',
          temperature: 0.5,
          maxTokens: 500,
        }, provider as any);
      }

      // Use LLM for standard summarization types
      return await this.llmService.summarizeEmail(
        text,
        subject,
        rule.type,
        provider as any,
      );
    } catch (error) {
      // Fallback to simple extraction if LLM fails
      console.error('LLM summarization failed, using fallback', error);
      return this.fallbackSummary(text, subject, rule.type, email.from);
    }
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

