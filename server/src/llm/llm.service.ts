import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { UsersService } from '../users/users.service';

export enum LLMProvider {
  GEMINI = 'gemini',
  OPENAI = 'openai',
}

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string; // Optional userId to use user's API key
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private geminiClient: GoogleGenerativeAI | null = null;
  private openaiClient: OpenAI | null = null;
  private defaultProvider: LLMProvider;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
  ) {
    this.initializeClients();
    this.defaultProvider = (this.configService.get<string>('LLM_PROVIDER') || 'openai').toLowerCase() as LLMProvider;
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
    userId?: string,
  ): Promise<string> {
    const selectedProvider = provider || this.defaultProvider;
    const effectiveUserId = userId || request.userId;

    try {
      switch (selectedProvider) {
        case LLMProvider.GEMINI:
          return await this.generateWithGemini(request, effectiveUserId);
        case LLMProvider.OPENAI:
          return await this.generateWithOpenAI(request, effectiveUserId);
        default:
          throw new Error(`Unsupported LLM provider: ${selectedProvider}`);
      }
    } catch (error) {
      this.logger.error(`Error generating text with ${selectedProvider}`, error);
      // Fallback to the other provider if available
      if (selectedProvider === LLMProvider.GEMINI) {
        this.logger.log(`Gemini failed, falling back to OpenAI (default provider)`);
        return await this.generateWithOpenAI(request, effectiveUserId);
      } else if (selectedProvider === LLMProvider.OPENAI) {
        this.logger.log(`OpenAI failed, falling back to Gemini`);
        return await this.generateWithGemini(request, effectiveUserId);
      }
      throw error;
    }
  }

  private async retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        this.logger.warn(`LLM operation failed, retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }

  private async generateWithGemini(request: LLMRequest, userId?: string): Promise<string> {
    // Note: Gemini doesn't support user-specific API keys, always uses system key
    if (!this.geminiClient) {
      throw new Error('Gemini client not initialized');
    }

    const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
    this.logger.log(`Generating text using Gemini model: ${modelName}`);

    return this.retryOperation(async () => {
      const model = this.geminiClient!.getGenerativeModel({
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
    });
  }

  private async generateWithOpenAI(request: LLMRequest, userId?: string): Promise<string> {
    // Try to get user's API key if userId is provided
    let openaiClient = this.openaiClient;
    let apiKeySource = 'system';

    if (userId) {
      try {
        const user = await this.usersService.findOne(userId);
        if (user?.openAiApiKey) {
          // User has their own API key - create a client with it
          openaiClient = new OpenAI({ apiKey: user.openAiApiKey });
          apiKeySource = 'user';
          this.logger.debug(`Using user's OpenAI API key for user ${userId}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch user's API key for ${userId}, using system key`, error);
      }
    }

    if (!openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-3.5-turbo';

    return this.retryOperation(async () => {
      const messages: any[] = [];
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      messages.push({ role: 'user', content: request.prompt });

      this.logger.debug(`Generating text with OpenAI using ${apiKeySource} API key${request.userId ? ` (userId: ${request.userId})` : ''}`);
      const completion = await openaiClient!.chat.completions.create({
        model,
        messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 2048,
      });

      return completion.choices[0]?.message?.content || '';
    });
  }

  async summarizeEmail(
    emailBody: string,
    emailSubject: string,
    summaryType: 'tldr' | 'bullet-points' | 'action-items' | 'sender-request' | 'custom',
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    const systemPrompts = {
      tldr: 'You are a helpful assistant that creates concise TL;DR summaries of emails. Be brief and capture the key points.',
      'bullet-points': 'You are a helpful assistant that creates bullet-point summaries of emails. Extract the main points and present them as a clear bullet list.',
      'action-items': 'You are a helpful assistant that extracts action items from emails. List only actionable tasks that need to be done.',
      'sender-request': 'You are a helpful assistant that identifies what the sender is requesting or asking for in the email. Be specific about their needs.',
      'custom': 'You are a helpful assistant that summarizes emails based on specific user instructions.',
    };

    // Optimized for prompt caching: static instruction at start, dynamic content at end
    const summaryInstruction = summaryType === 'tldr' 
      ? 'Please provide a concise TL;DR summary'
      : summaryType === 'bullet-points'
      ? 'Please provide a bullet-point summary'
      : summaryType === 'action-items'
      ? 'Please extract action items'
      : 'Please identify what the sender is requesting';
    
    // Check if this is a thread (contains multiple messages)
    const isThread = emailBody.includes('[Message') && emailBody.includes('---');
    const contextNote = isThread 
      ? 'This is an email thread with multiple messages. Summarize the entire conversation, focusing on the most recent developments and key points across all messages.'
      : '';
    
    const prompt = `${summaryInstruction}${isThread ? ' for the following email thread' : ' for the following email'}:\n\nSubject: ${emailSubject}\n\n${contextNote ? contextNote + '\n\n' : ''}Body:\n${emailBody}`;

    return await this.generateText({
      prompt,
      systemPrompt: systemPrompts[summaryType],
      temperature: 0.5,
      maxTokens: 500,
      userId,
    }, provider, userId);
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
    userId?: string,
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
      userId,
    }, provider, userId);
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
    userId?: string,
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
        userId,
      }, provider, userId);
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
      userId,
    }, provider, userId);
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
    userId?: string,
  ): Promise<{ score: number; reasoning: string; isUrgent: boolean }> {
    const systemPrompt = `You are an email prioritization assistant. Analyze emails and assign a priority score from 0-100.
Consider:
- Sender importance (job title, relationship)
- Email content urgency
- Subject line indicators
- User's historical response patterns

IMPORTANT: Only mark an email as urgent (isUrgent: true) if it requires IMMEDIATE attention - true emergencies, critical deadlines, or time-sensitive requests that cannot wait. Regular high-priority emails should have high scores (80-90) but isUrgent should be false unless it's truly urgent.

Return a JSON object with: { "score": number (0-100), "reasoning": string, "isUrgent": boolean }`;

    const historyContext = userHistory
      ? `\nUser's average time to reply: ${userHistory.averageTimeToReply || 'unknown'} hours`
      : '';

    // Optimized for prompt caching: static instruction at start, dynamic email content at end
    const prompt = `Analyze this email and provide a priority score.\n\nFrom: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ''}\nSubject: ${email.subject}\n\n${email.body}${historyContext}`;

    const response = await this.generateText({
      prompt,
      systemPrompt,
      temperature: 0.3, // Lower temperature for more consistent scoring
      maxTokens: 500,
      userId,
    }, provider, userId);

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

