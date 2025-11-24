import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export enum LLMProvider {
  GEMINI = 'gemini',
  OPENAI = 'openai',
}

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private geminiClient: GoogleGenerativeAI | null = null;
  private openaiClient: OpenAI | null = null;
  private defaultProvider: LLMProvider;

  constructor(private configService: ConfigService) {
    this.initializeClients();
    this.defaultProvider = (this.configService.get<string>('LLM_PROVIDER') || 'gemini').toLowerCase() as LLMProvider;
  }

  private initializeClients() {
    // Initialize Gemini
    const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (geminiApiKey) {
      try {
        this.geminiClient = new GoogleGenerativeAI(geminiApiKey);
        this.logger.log('Gemini client initialized');
      } catch (error) {
        this.logger.error('Failed to initialize Gemini client', error);
      }
    } else {
      this.logger.warn('GEMINI_API_KEY not found, Gemini will be unavailable');
    }

    // Initialize OpenAI
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openaiApiKey) {
      try {
        this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
        this.logger.log('OpenAI client initialized');
      } catch (error) {
        this.logger.error('Failed to initialize OpenAI client', error);
      }
    } else {
      this.logger.warn('OPENAI_API_KEY not found, OpenAI will be unavailable');
    }
  }

  async generateText(
    request: LLMRequest,
    provider?: LLMProvider,
  ): Promise<string> {
    const selectedProvider = provider || this.defaultProvider;

    try {
      switch (selectedProvider) {
        case LLMProvider.GEMINI:
          return await this.generateWithGemini(request);
        case LLMProvider.OPENAI:
          return await this.generateWithOpenAI(request);
        default:
          throw new Error(`Unsupported LLM provider: ${selectedProvider}`);
      }
    } catch (error) {
      this.logger.error(`Error generating text with ${selectedProvider}`, error);
      // Fallback to the other provider if available
      if (selectedProvider === LLMProvider.GEMINI && this.openaiClient) {
        this.logger.log('Falling back to OpenAI');
        return await this.generateWithOpenAI(request);
      } else if (selectedProvider === LLMProvider.OPENAI && this.geminiClient) {
        this.logger.log('Falling back to Gemini');
        return await this.generateWithGemini(request);
      }
      throw error;
    }
  }

  private async generateWithGemini(request: LLMRequest): Promise<string> {
    if (!this.geminiClient) {
      throw new Error('Gemini client not initialized');
    }

    const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-pro';
    this.logger.log(`Generating text using Gemini model: ${modelName}`);

    const model = this.geminiClient.getGenerativeModel({
      model: modelName,
    });

    const fullPrompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: request.temperature || 0.7,
        maxOutputTokens: request.maxTokens || 2048,
      },
    });

    const response = result.response;
    return response.text();
  }

  private async generateWithOpenAI(request: LLMRequest): Promise<string> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-3.5-turbo';

    const messages: any[] = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    const completion = await this.openaiClient.chat.completions.create({
      model,
      messages,
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 2048,
    });

    return completion.choices[0]?.message?.content || '';
  }

  async summarizeEmail(
    emailBody: string,
    emailSubject: string,
    summaryType: 'tldr' | 'bullet-points' | 'action-items' | 'sender-request' | 'custom',
    provider?: LLMProvider,
  ): Promise<string> {
    const systemPrompts = {
      tldr: 'You are a helpful assistant that creates concise TL;DR summaries of emails. Be brief and capture the key points.',
      'bullet-points': 'You are a helpful assistant that creates bullet-point summaries of emails. Extract the main points and present them as a clear bullet list.',
      'action-items': 'You are a helpful assistant that extracts action items from emails. List only actionable tasks that need to be done.',
      'sender-request': 'You are a helpful assistant that identifies what the sender is requesting or asking for in the email. Be specific about their needs.',
      'custom': 'You are a helpful assistant that summarizes emails based on specific user instructions.',
    };

    const prompt = `Email Subject: ${emailSubject}\n\nEmail Body:\n${emailBody}\n\nPlease provide a ${summaryType} summary.`;

    return await this.generateText({
      prompt,
      systemPrompt: systemPrompts[summaryType],
      temperature: 0.5,
      maxTokens: 500,
    }, provider);
  }

  async generateReplyDraft(
    originalEmail: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    userContext: {
      tone?: string;
      commonPhrases?: string[];
      writingStyle?: string;
    },
    provider?: LLMProvider,
  ): Promise<string> {
    const tone = userContext.tone || 'professional';
    const styleGuidance = userContext.writingStyle
      ? `Writing style: ${userContext.writingStyle}`
      : '';

    const systemPrompt = `You are a helpful assistant that drafts email replies. 
The user prefers a ${tone} tone.
${styleGuidance}
Generate a professional, concise reply that addresses the original email appropriately.`;

    const contextPhrases = userContext.commonPhrases?.length
      ? `\n\nUser commonly uses phrases like: ${userContext.commonPhrases.slice(0, 3).join(', ')}`
      : '';

    const prompt = `Original email from ${originalEmail.fromName || originalEmail.from}:
Subject: ${originalEmail.subject}

${originalEmail.body}

${contextPhrases}

Generate a reply draft that:
1. Acknowledges the original email
2. Addresses any questions or requests
3. Maintains a ${tone} tone
4. Is concise and professional`;

    return await this.generateText({
      prompt,
      systemPrompt,
      temperature: 0.7,
      maxTokens: 1000,
    }, provider);
  }

  async generateMeetingReply(
    originalEmail: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    availableSlots: Array<{ start: string; end: string }>,
    calendarBookingUrl?: string,
    provider?: LLMProvider,
  ): Promise<string> {
    // Handle empty slots case
    if (availableSlots.length === 0) {
      const systemPrompt = `You are a helpful assistant that drafts professional meeting scheduling replies when no slots are available. Be polite and ask for their availability.`;
      const prompt = `Original email from ${originalEmail.fromName || originalEmail.from}:
Subject: ${originalEmail.subject}

${originalEmail.body}

I don't have any available slots in the next week. Generate a professional, polite reply asking for their availability.`;

      return await this.generateText({
        prompt,
        systemPrompt,
        temperature: 0.7,
        maxTokens: 400,
      }, provider);
    }
    const slotsText = availableSlots
      .slice(0, 5)
      .map((slot, i) => {
        const start = new Date(slot.start);
        return `${i + 1}. ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      })
      .join('\n');

    const calendarLink = calendarBookingUrl
      ? `\n\nYou can also book directly on my calendar: ${calendarBookingUrl}`
      : '';

    const systemPrompt = `You are a helpful assistant that drafts professional meeting scheduling replies. 
Be friendly, professional, and helpful when suggesting meeting times.`;

    const prompt = `Original email from ${originalEmail.fromName || originalEmail.from}:
Subject: ${originalEmail.subject}

${originalEmail.body}

Available time slots:
${slotsText}
${calendarLink}

Generate a professional reply that:
1. Thanks them for reaching out
2. Offers the available time slots
3. Asks what works best for them
4. Is friendly and professional`;

    return await this.generateText({
      prompt,
      systemPrompt,
      temperature: 0.7,
      maxTokens: 800,
    }, provider);
  }

  async analyzePriority(
    email: {
      from: string;
      fromName?: string;
      senderJobTitle?: string;
      subject: string;
      body: string;
    },
    userHistory?: {
      averageTimeToReply?: number;
      similarEmailsReplyTime?: number;
    },
    provider?: LLMProvider,
  ): Promise<{ score: number; reasoning: string; isUrgent: boolean }> {
    const systemPrompt = `You are an email prioritization assistant. Analyze emails and assign a priority score from 0-100.
Consider:
- Sender importance (job title, relationship)
- Email content urgency
- Subject line indicators
- User's historical response patterns

Return a JSON object with: { "score": number (0-100), "reasoning": string, "isUrgent": boolean }`;

    const historyContext = userHistory
      ? `\nUser's average time to reply: ${userHistory.averageTimeToReply || 'unknown'} hours`
      : '';

    const prompt = `Email to prioritize:
From: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ''}
Subject: ${email.subject}

${email.body}
${historyContext}

Analyze this email and provide a priority score.`;

    const response = await this.generateText({
      prompt,
      systemPrompt,
      temperature: 0.3, // Lower temperature for more consistent scoring
      maxTokens: 500,
    }, provider);

    // Try to parse JSON response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.max(0, Math.min(100, parsed.score || 50)),
          reasoning: parsed.reasoning || 'No reasoning provided',
          isUrgent: parsed.isUrgent || false,
        };
      }
    } catch (error) {
      this.logger.warn('Failed to parse LLM priority response as JSON', error);
    }

    // Fallback: extract score from text if JSON parsing fails
    const scoreMatch = response.match(/score[:\s]+(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;
    const isUrgent = /urgent|asap|critical|emergency/i.test(response);

    return {
      score: Math.max(0, Math.min(100, score)),
      reasoning: response.substring(0, 200),
      isUrgent,
    };
  }

  getAvailableProviders(): LLMProvider[] {
    const providers: LLMProvider[] = [];
    if (this.geminiClient) providers.push(LLMProvider.GEMINI);
    if (this.openaiClient) providers.push(LLMProvider.OPENAI);
    return providers;
  }

  getDefaultProvider(): LLMProvider {
    return this.defaultProvider;
  }
}

