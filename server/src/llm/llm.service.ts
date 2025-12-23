import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { UsersService } from "../users/users.service";
import { cleanEmailContent } from "./email-content-cleaner";
import { getPrompt, renderPrompt } from "./prompts";

export enum LLMProvider {
  GEMINI = "gemini",
  OPENAI = "openai",
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
    this.defaultProvider = (
      this.configService.get<string>("LLM_PROVIDER") || "openai"
    ).toLowerCase() as LLMProvider;
  }

  private initializeClients() {
    // Initialize Gemini
    const geminiApiKey = this.configService.get<string>("GEMINI_API_KEY");
    if (geminiApiKey) {
      try {
        this.geminiClient = new GoogleGenerativeAI(geminiApiKey);
        this.logger.log("Gemini client initialized");
      } catch (error) {
        this.logger.error("Failed to initialize Gemini client", error);
      }
    } else {
      this.logger.warn("GEMINI_API_KEY not found, Gemini will be unavailable");
    }

    // Initialize OpenAI
    const openaiApiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (openaiApiKey) {
      try {
        this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
        this.logger.log("OpenAI client initialized");
      } catch (error) {
        this.logger.error("Failed to initialize OpenAI client", error);
      }
    } else {
      this.logger.warn("OPENAI_API_KEY not found, OpenAI will be unavailable");
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
      this.logger.error(
        `Error generating text with ${selectedProvider}`,
        error,
      );
      // Fallback to the other provider if available
      if (selectedProvider === LLMProvider.GEMINI) {
        this.logger.log(
          `Gemini failed, falling back to OpenAI (default provider)`,
        );
        return await this.generateWithOpenAI(request, effectiveUserId);
      } else if (selectedProvider === LLMProvider.OPENAI) {
        this.logger.log(`OpenAI failed, falling back to Gemini`);
        return await this.generateWithGemini(request, effectiveUserId);
      }
      throw error;
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        this.logger.warn(
          `LLM operation failed, retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Max retries exceeded");
  }

  private async generateWithGemini(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    // Note: Gemini doesn't support user-specific API keys, always uses system key
    if (!this.geminiClient) {
      throw new Error("Gemini client not initialized");
    }

    const modelName =
      this.configService.get<string>("GEMINI_MODEL") || "gemini-1.5-flash";
    this.logger.log(`Generating text using Gemini model: ${modelName}`);

    return this.retryOperation(async () => {
      const model = this.geminiClient!.getGenerativeModel({
        model: modelName,
      });

      const fullPrompt = request.systemPrompt
        ? `${request.systemPrompt}\n\n${request.prompt}`
        : request.prompt;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: request.temperature || 0.7,
          maxOutputTokens: request.maxTokens || 2048,
        },
      });

      const response = result.response;
      return response.text();
    });
  }

  private async generateWithOpenAI(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    // Try to get user's API key if userId is provided
    let openaiClient = this.openaiClient;
    let apiKeySource = "system";

    if (userId) {
      try {
        const user = await this.usersService.findOne(userId);
        if (user?.openAiApiKey) {
          // User has their own API key - create a client with it
          openaiClient = new OpenAI({ apiKey: user.openAiApiKey });
          apiKeySource = "user";
          this.logger.debug(`Using user's OpenAI API key for user ${userId}`);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch user's API key for ${userId}, using system key`,
          error,
        );
      }
    }

    if (!openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

    const model =
      this.configService.get<string>("OPENAI_MODEL") || "gpt-3.5-turbo";

    return this.retryOperation(async () => {
      const messages: any[] = [];
      if (request.systemPrompt) {
        messages.push({ role: "system", content: request.systemPrompt });
      }
      messages.push({ role: "user", content: request.prompt });

      this.logger.debug(
        `Generating text with OpenAI using ${apiKeySource} API key${request.userId ? ` (userId: ${request.userId})` : ""}`,
      );
      const completion = await openaiClient!.chat.completions.create({
        model,
        messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 2048,
      });

      return completion.choices[0]?.message?.content || "";
    });
  }

  async analyzeEmailPatterns(
    receivedEmails: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      receivedAt: string;
      isRead?: boolean;
      timeToReply?: number | null; // Time to reply in minutes
      readAt?: string | null;
      repliedAt?: string | null;
      starCount?: number;
      isArchived?: boolean;
    }>,
    sentEmails: Array<{
      emailId?: string; // Optional email ID for linking
      to: string;
      subject: string;
      body: string;
      sentAt: string;
    }>,
    provider?: LLMProvider,
    userId?: string,
    userEmail?: string,
    currentContext?: Array<{ key: string; value: string; source?: string }>,
  ): Promise<{
    context: Array<{ key: string; value: string; source: string }>;
    writingStyle: {
      tone: string;
      style: string;
      commonPhrases: string[];
      emailExamples?: string[];
    };
  }> {
    // Load prompt from markdown file - NO hardcoded prompts!
    const promptConfig = getPrompt("analyze_email_patterns");
    if (!promptConfig) {
      this.logger.error(
        "analyze_email_patterns prompt not found in markdown files - cannot analyze patterns",
      );
      return {
        context: [],
        writingStyle: {
          tone: "Professional",
          style: "Concise",
          commonPhrases: [],
        },
      };
    }

    // Prepare data for LLM (limit size)
    // Include read status, archive status, star status, and timeToReply to infer user behavior
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Preparing data: ${receivedEmails.length} received threads/emails provided`,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Using ALL ${receivedEmails.length} items (not limiting to 50)`,
    );
    
    const receivedData = receivedEmails
      // Use all threads/emails provided (no artificial limit)
      .map((e) => {
        // Use timeToReply if available (in minutes), otherwise calculate from repliedAt
        const replyTimeMinutes =
          e.timeToReply ??
          (e.repliedAt
            ? (new Date(e.repliedAt).getTime() -
                new Date(e.receivedAt).getTime()) /
              1000 /
              60
            : null);
        const readStatus = e.isRead ? "Read" : "Unread";
        const archiveStatus = e.isArchived ? "Archived" : "InInbox";
        const starStatus =
          (e.starCount || 0) > 0 ? `Starred(${e.starCount})` : "NotStarred";
        const behavior =
          e.isArchived && !e.isRead
            ? "ArchivedWithoutReading"
            : e.isRead && !e.isArchived
              ? "ReadButKept"
              : e.isRead && e.isArchived
                ? "ReadThenArchived"
                : "UnreadInInbox";
        const replyInfo =
          replyTimeMinutes !== null
            ? `${replyTimeMinutes.toFixed(0)}m`
            : "NoReply";
        const isQuickReply = replyTimeMinutes !== null && replyTimeMinutes < 30;
        return `From: ${e.fromName || e.from}, Subject: ${e.subject}, Read: ${readStatus}, ${archiveStatus}, ${starStatus}, Behavior: ${behavior}, ReplyTime: ${replyInfo}${isQuickReply ? " (QUICK)" : ""}`;
      })
      .join("\n");

    // Include full email body for writing style analysis (redacted for privacy in actual usage)
    // Extract longer examples (full emails) instead of just phrases
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Preparing sent emails: ${sentEmails.length} sent emails provided, will use first 30`,
    );
    
    const sentData = sentEmails
      .slice(0, 30)
      .map((e) => {
        // Use full body, but clean it up for readability
        const cleanBody = e.body.replace(/\n{3,}/g, "\n\n").trim();
        return `To: ${e.to}, Subject: ${e.subject}\nFull Email Body:\n${cleanBody}\n---`;
      })
      .join("\n\n");

    // Analyze times of day for read/response patterns
    const receivedHours: number[] = [];
    const replyHours: number[] = [];

    receivedEmails.forEach((e) => {
      if (e.receivedAt) {
        receivedHours.push(new Date(e.receivedAt).getHours());
      }
      if (e.timeToReply !== null && e.timeToReply < 24 * 60) {
        // Replies within 24 hours
        const received = new Date(e.receivedAt);
        const replyMinutes = e.timeToReply;
        const replyTime = new Date(
          received.getTime() + replyMinutes * 60 * 1000,
        );
        replyHours.push(replyTime.getHours());
      }
    });

    const timeAnalysis = {
      receivedHours:
        receivedHours.length > 0 ? this.getTimePattern(receivedHours) : null,
      replyHours:
        replyHours.length > 0 ? this.getTimePattern(replyHours) : null,
    };

    // Format current context for the prompt
    const currentContextText =
      currentContext && currentContext.length > 0
        ? currentContext
            .map(
              (ctx) =>
                `- ${ctx.key}: ${ctx.value}${ctx.source ? ` (source: ${ctx.source})` : ""}`,
            )
            .join("\n")
        : "No existing context.";

    // The markdown file contains the full prompt template with {{variables}}
    const timeAnalysisText =
      timeAnalysis.receivedHours || timeAnalysis.replyHours
        ? `\n\nTime Patterns:\n- Email reading times: ${timeAnalysis.receivedHours || "Not enough data"}\n- Email reply times: ${timeAnalysis.replyHours || "Not enough data"}`
        : "";

    const renderedPrompt = renderPrompt(promptConfig.prompt || "", {
      userEmail: userEmail || "unknown@example.com",
      currentContext: currentContextText,
      receivedEmails: receivedData,
      sentEmails: sentData,
      timeAnalysis: timeAnalysisText,
    });

    // Use the full prompt as the user message (markdown contains all instructions)
    const prompt = renderedPrompt;
    const systemPrompt = "";

    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] About to call generateText() - prompt length: ${prompt.length} chars`,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Input: ${receivedEmails.length} received emails, ${sentEmails.length} sent emails`,
    );
    const llmCallStart = Date.now();
    
    const response = await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: 0.4,
        maxTokens: 1500,
        userId,
      },
      provider,
      userId,
    );
    
    const llmCallDuration = Date.now() - llmCallStart;
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] generateText() completed in ${llmCallDuration}ms (${(llmCallDuration / 1000).toFixed(2)}s)`,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Response length: ${response.length} chars`,
    );

    try {
      // Handle markdown code blocks if present
      let jsonString = response;
      jsonString = jsonString
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Ensure required structure
        return {
          context: Array.isArray(parsed.context) ? parsed.context : [],
          writingStyle:
            parsed.writingStyle && typeof parsed.writingStyle === "object"
              ? {
                  tone: parsed.writingStyle.tone || "Professional",
                  style: parsed.writingStyle.style || "Concise",
                  commonPhrases: Array.isArray(
                    parsed.writingStyle.commonPhrases,
                  )
                    ? parsed.writingStyle.commonPhrases
                    : [],
                  emailExamples: Array.isArray(
                    parsed.writingStyle.emailExamples,
                  )
                    ? parsed.writingStyle.emailExamples
                    : undefined,
                }
              : { tone: "Professional", style: "Concise", commonPhrases: [] },
        };
      }
    } catch (error) {
      this.logger.warn("Failed to parse LLM analysis response as JSON", error);
    }

    // Fallback
    return {
      context: [],
      writingStyle: {
        tone: "Professional",
        style: "Concise",
        commonPhrases: [],
        emailExamples: [],
      },
    };
  }

  async summarizeEmail(
    emailBody: string,
    emailSubject: string,
    summaryType:
      | "tldr"
      | "bullet-points"
      | "action-items"
      | "sender-request"
      | "custom",
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    const systemPrompts = {
      tldr: "You are a helpful assistant that creates concise TL;DR summaries of emails. Be brief and capture the key points.",
      "bullet-points":
        "You are a helpful assistant that creates bullet-point summaries of emails. Extract the main points and present them as a clear bullet list.",
      "action-items":
        "You are a helpful assistant that extracts action items from emails. List only actionable tasks that need to be done.",
      "sender-request":
        "You are a helpful assistant that identifies what the sender is requesting or asking for in the email. Be specific about their needs.",
      custom:
        "You are a helpful assistant that summarizes emails based on specific user instructions.",
    };

    // Optimized for prompt caching: static instruction at start, dynamic content at end
    const summaryInstruction =
      summaryType === "tldr"
        ? "Please provide a concise TL;DR summary"
        : summaryType === "bullet-points"
          ? "Please provide a bullet-point summary"
          : summaryType === "action-items"
            ? "Please extract action items"
            : "Please identify what the sender is requesting";

    // Check if this is a thread (contains multiple messages)
    const isThread =
      emailBody.includes("[Message") && emailBody.includes("---");
    const contextNote = isThread
      ? "This is an email thread with multiple messages. Summarize the entire conversation, focusing on the most recent developments and key points across all messages."
      : "";

    const prompt = `${summaryInstruction}${isThread ? " for the following email thread" : " for the following email"}:\n\nSubject: ${emailSubject}\n\n${contextNote ? `${contextNote}\n\n` : ""}Body:\n${emailBody}`;

    return await this.generateText(
      {
        prompt,
        systemPrompt: systemPrompts[summaryType],
        temperature: 0.5,
        maxTokens: 500,
        userId,
      },
      provider,
      userId,
    );
  }

  async checkTone(
    text: string,
    rules: string[] = ["Be concise", "Use non-violent communication"],
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{ isOk: boolean; suggestions: string[]; revisedText?: string }> {
    const systemPrompt = `You are a communication assistant that checks emails for tone and style.
Rules to enforce:
${rules.map((r) => `- ${r}`).join("\n")}

Analyze the text and determine if it violates any rules.
If it violates rules, explain why and provide a revised version.
If it follows rules, simply confirm it is OK.

Return a JSON object with: { "isOk": boolean, "suggestions": string[], "revisedText": string (optional) }`;

    const prompt = `Check this text against the rules:\n\n${text}`;

    const response = await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: 0.3,
        maxTokens: 800,
        userId,
      },
      provider,
      userId,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM tone check response as JSON",
        error,
      );
    }

    return { isOk: true, suggestions: [] };
  }

  async extractActionItems(
    emailBody: string,
    provider?: LLMProvider,
    userId?: string,
    senderInfo?: { from: string; fromName?: string },
    recipientInfo?: { name?: string; email?: string },
  ): Promise<Array<{ description: string; confidence: number }>> {
    // Clean email body: strip HTML, remove signatures, limit to 2000 chars
    const cleanedBody = cleanEmailContent(emailBody, null, 2000);

    // Load prompt from markdown file - NO hardcoded prompts!
    const promptConfig = getPrompt("extract_action_items");
    if (!promptConfig) {
      this.logger.error(
        "extract_action_items prompt not found in markdown files - cannot extract action items",
      );
      return [];
    }

    // The markdown file contains the full prompt template with {{variables}}
    const fullPrompt = renderPrompt(promptConfig.prompt || "", {
      body: cleanedBody,
      from: senderInfo?.from || "Unknown",
      fromName: senderInfo?.fromName || senderInfo?.from || "Unknown",
      recipientName: recipientInfo?.name || "You",
      recipientEmail: recipientInfo?.email || "",
    });

    // Use the full prompt as the user message (markdown contains all instructions)
    const prompt = fullPrompt;
    const systemPrompt = "";

    const response = await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: 0.3,
        maxTokens: 800,
        userId,
      },
      provider,
      userId,
    );

    try {
      // Handle markdown code blocks if present
      let jsonString = response;
      jsonString = jsonString
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.actionItems || [];
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM action items response as JSON",
        error,
      );
    }

    return [];
  }

  async generateReplyOptions(
    originalEmail: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    userContext: {
      tone?: string;
      writingStyle?: string;
    },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<Array<{ label: string; text: string }>> {
    // Clean email body: strip HTML, remove signatures, limit to 2000 chars
    const cleanedBody = cleanEmailContent(originalEmail.body, null, 2000);

    const tone = userContext.tone || "professional";

    const systemPrompt = `You are a helpful assistant that drafts email replies.
The user prefers a ${tone} tone.
Generate 2 distinct reply options based on the email content:
1. A "Positive/Agree" option (e.g., accepting a meeting, agreeing to a proposal)
2. A "Negative/Decline/Defer" option (e.g., declining politely, asking for more time)

Return a JSON object with a key "options" which is an array of: { "label": string (short description), "text": string (full email body) }`;

    const prompt = `Original email from ${originalEmail.fromName || originalEmail.from}:
Subject: ${originalEmail.subject}

${cleanedBody}

Generate 2 reply options.`;

    const response = await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: 0.7,
        maxTokens: 1000,
        userId,
      },
      provider,
      userId,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.options || [];
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM reply options response as JSON",
        error,
      );
    }

    // Fallback: return single generic draft if JSON parsing fails
    const fallbackDraft = await this.generateReplyDraft(
      originalEmail,
      userContext,
      provider,
      userId,
    );
    return [{ label: "Draft Reply", text: fallbackDraft }];
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
    // Clean email body: strip HTML, remove signatures, limit to 2000 chars
    const cleanedBody = cleanEmailContent(originalEmail.body, null, 2000);

    const tone = userContext.tone || "professional";
    const styleGuidance = userContext.writingStyle
      ? `Writing style: ${userContext.writingStyle}`
      : "";

    const systemPrompt = `You are a helpful assistant that drafts email replies. 
The user prefers a ${tone} tone.
${styleGuidance}
Generate a professional, concise reply that addresses the original email appropriately.`;

    const contextPhrases = userContext.commonPhrases?.length
      ? `\n\nUser commonly uses phrases like: ${userContext.commonPhrases.slice(0, 3).join(", ")}`
      : "";

    const prompt = `Original email from ${originalEmail.fromName || originalEmail.from}:
Subject: ${originalEmail.subject}

${cleanedBody}

${contextPhrases}

Generate a reply draft that:
1. Acknowledges the original email
2. Addresses any questions or requests
3. Maintains a ${tone} tone
4. Is concise and professional`;

    return await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: 0.7,
        maxTokens: 1000,
        userId,
      },
      provider,
      userId,
    );
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
    // Clean email body: strip HTML, remove signatures, limit to 2000 chars
    const cleanedBody = cleanEmailContent(originalEmail.body, null, 2000);

    // Handle empty slots case
    if (availableSlots.length === 0) {
      const systemPrompt = `You are a helpful assistant that drafts professional meeting scheduling replies when no slots are available. Be polite and ask for their availability.`;
      const prompt = `Original email from ${originalEmail.fromName || originalEmail.from}:
Subject: ${originalEmail.subject}

${cleanedBody}

I don't have any available slots in the next week. Generate a professional, polite reply asking for their availability.`;

      return await this.generateText(
        {
          prompt,
          systemPrompt,
          temperature: 0.7,
          maxTokens: 400,
          userId,
        },
        provider,
        userId,
      );
    }
    const slotsText = availableSlots
      .slice(0, 5)
      .map((slot, i) => {
        const start = new Date(slot.start);
        return `${i + 1}. ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      })
      .join("\n");

    const calendarLink = calendarBookingUrl
      ? `\n\nYou can also book directly on my calendar: ${calendarBookingUrl}`
      : "";

    const systemPrompt = `You are a helpful assistant that drafts professional meeting scheduling replies. 
Be friendly, professional, and helpful when suggesting meeting times.`;

    const prompt = `Original email from ${originalEmail.fromName || originalEmail.from}:
Subject: ${originalEmail.subject}

${cleanedBody}

Available time slots:
${slotsText}
${calendarLink}

Generate a professional reply that:
1. Thanks them for reaching out
2. Offers the available time slots
3. Asks what works best for them
4. Is friendly and professional`;

    return await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: 0.7,
        maxTokens: 800,
        userId,
      },
      provider,
      userId,
    );
  }

  async analyzePriority(
    email: {
      from: string;
      fromName?: string;
      senderJobTitle?: string;
      subject: string;
      body: string; // Should be pre-cleaned, but we'll clean defensively
    },
    userHistory?: {
      averageTimeToReply?: number;
      similarEmailsReplyTime?: number;
    },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{
    urgencyScore: number;
    urgencyExplanation: string;
    sentimentScore: number;
    reasoning: string;
  }> {
    // Defensive cleaning in case body wasn't pre-cleaned by caller
    const cleanedBody = cleanEmailContent(email.body, null, 2000);

    // Load prompt from markdown file
    const promptConfig = getPrompt("analyze_priority");
    if (!promptConfig) {
      this.logger.warn("analyze_priority prompt not found, using fallback");
      // Fallback: use inline prompt if markdown file not found
      const cleanedBody = cleanEmailContent(email.body, null, 2000);
      const historyContext = userHistory
        ? `\nUser's average time to reply: ${userHistory.averageTimeToReply || "unknown"} hours`
        : "";
      const fallbackPrompt = `Analyze this email and provide component scores.\n\nFrom: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ""}\nSubject: ${email.subject}\n\n${cleanedBody}${historyContext}`;
      
      const fallbackSystemPrompt = `You are an email prioritization assistant. Provide component scores only (urgencyScore 0-100, urgencyExplanation, sentimentScore -1 to 1, reasoning). Return JSON: { "urgencyScore": number, "urgencyExplanation": string, "sentimentScore": number, "reasoning": string }`;

      const response = await this.generateText(
        {
          prompt: fallbackPrompt,
          systemPrompt: fallbackSystemPrompt,
          temperature: 0.3,
          maxTokens: 500,
          userId,
        },
        provider,
        userId,
      );

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            urgencyScore: Math.max(0, Math.min(100, parsed.urgencyScore || 0)),
            urgencyExplanation:
              parsed.urgencyExplanation || "No urgency explanation provided",
            sentimentScore:
              parsed.sentimentScore !== undefined
                ? Math.max(-1, Math.min(1, parsed.sentimentScore))
                : 0,
            reasoning: parsed.reasoning || "No reasoning provided",
          };
        }
      } catch (error) {
        this.logger.warn("Failed to parse LLM priority response as JSON", error);
      }

      return {
        urgencyScore: 0,
        urgencyExplanation: "No urgent indicators detected",
        sentimentScore: 0,
        reasoning: response.substring(0, 200),
      };
    }

    // Render prompt template with variables
    const prompt = renderPrompt(promptConfig.prompt, {
      from: email.fromName || email.from,
      fromName: email.fromName || email.from,
      senderJobTitle: email.senderJobTitle || "",
      subject: email.subject,
      body: cleanedBody,
      averageTimeToReply: userHistory?.averageTimeToReply,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: 0.3, // Lower temperature for more consistent scoring
        maxTokens: 500,
        userId,
      },
      provider,
      userId,
    );

    // Try to parse JSON response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          urgencyScore: Math.max(0, Math.min(100, parsed.urgencyScore || 0)),
          urgencyExplanation:
            parsed.urgencyExplanation || "No urgency explanation provided",
          sentimentScore:
            parsed.sentimentScore !== undefined
              ? Math.max(-1, Math.min(1, parsed.sentimentScore))
              : 0,
          reasoning: parsed.reasoning || "No reasoning provided",
        };
      }
    } catch (error) {
      this.logger.warn("Failed to parse LLM priority response as JSON", error);
    }

    // Fallback: extract component scores from text if JSON parsing fails
    const urgencyKeywords = /urgent|asap|critical|emergency/i.test(response);
    const urgencyScore = urgencyKeywords ? 90 : 0;
    const urgencyExplanation = urgencyKeywords
      ? "Contains urgent keywords"
      : "No urgent indicators detected";

    return {
      urgencyScore,
      urgencyExplanation,
      sentimentScore: 0, // Neutral as fallback
      reasoning: response.substring(0, 200),
    };
  }

  /**
   * Generate a follow-up draft for an email that hasn't received a reply
   * @param subject Email thread subject
   * @param threadMessages Last few messages in the thread (3-5 messages, in chronological order)
   * @param theirName Name of the recipient
   * @param businessDaysWaiting Number of business days since last user message
   * @param userCommunicationStyle User's communication style from context (tone, common phrases)
   * @param provider Optional LLM provider override
   * @param userId Optional user ID for API key
   */
  async generateFollowUpDraft(
    subject: string,
    threadMessages: Array<{
      from: string;
      fromName?: string;
      body: string;
      receivedAt: Date;
      isFromUser: boolean;
    }>,
    theirName: string,
    businessDaysWaiting: number,
    userCommunicationStyle?: { tone?: string; commonPhrases?: string[] },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    // Build system prompt with user communication style
    let systemPrompt = `You are a helpful assistant that drafts follow-up emails.
Generate a VERY concise, polite follow-up email (2-3 sentences max).
The tone should be friendly but professional - not pushy or aggressive.
Don't apologize excessively. Be direct but kind.`;

    if (userCommunicationStyle?.tone) {
      systemPrompt += `\n\nUser's preferred tone: ${userCommunicationStyle.tone}`;
    }

    if (
      userCommunicationStyle?.commonPhrases &&
      userCommunicationStyle.commonPhrases.length > 0
    ) {
      systemPrompt += `\n\nUser commonly uses these phrases: ${userCommunicationStyle.commonPhrases.join(", ")}`;
    }

    // Build thread context from last few messages
    const threadContext = threadMessages
      .map((msg, idx) => {
        const sender = msg.isFromUser ? "You" : msg.fromName || msg.from;
        const date = new Date(msg.receivedAt).toLocaleDateString();
        const cleanedBody = cleanEmailContent(msg.body, "").substring(0, 500);
        return `[Message ${idx + 1} from ${sender} on ${date}]:\n${cleanedBody}`;
      })
      .join("\n\n---\n\n");

    const prompt = `I need to follow up on an email thread.

Subject: ${subject}

Thread context (last ${threadMessages.length} messages in chronological order):
${threadContext}

Recipient: ${theirName}
Business days since my last message: ${businessDaysWaiting} ${businessDaysWaiting === 1 ? "day" : "days"}

Generate a brief, friendly follow-up message. Keep it to 2-3 sentences maximum. Don't include a greeting or signature - just the body text.`;

    return await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: 0.7,
        maxTokens: 200,
        userId,
      },
      provider,
      userId,
    );
  }

  /**
   * Analyze override reason to extract rules and suggest context updates
   */
  async analyzeOverrideReason(
    email: {
      from: string;
      fromName?: string | null;
      subject: string;
      body: string;
    },
    reasonType: string,
    reasonText: string,
    currentContext: Array<{
      contextKey: string;
      contextValue: string;
      priority?: number | null;
    }>,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{
    suggestedRules: string[];
    updatedContexts: Array<{
      contextKey: string;
      contextValue: string;
      priority?: number;
    }>;
  }> {
    const cleanedBody = cleanEmailContent(email.body || "", null, 1000);
    const contextSummary = currentContext
      .slice(0, 10)
      .map((c) => `${c.contextKey}: ${c.contextValue}`)
      .join("\n");

    const systemPrompt = `You are an assistant that analyzes user feedback about email priority scoring.
When a user overrides a priority score, analyze their reason and suggest updates to the user's context rules.

Context keys available:
- VIP_CONTACT: Important contacts
- MY_GOALS: User's goals
- WORKING_ON: Current projects
- DONT_CARE: Things user doesn't care about
- URGENT: What user considers urgent

Return a JSON object with:
{
  "suggestedRules": ["rule1", "rule2"],
  "updatedContexts": [
    {
      "contextKey": "VIP_CONTACT",
      "contextValue": "contact name or email",
      "priority": 1 (optional, 1-3)
    }
  ]
}`;

    const prompt = `User overrode priority for this email:
From: ${email.fromName || email.from}
Subject: ${email.subject}
Body: ${cleanedBody.substring(0, 500)}

Override reason type: ${reasonType}
Reason text: ${reasonText}

Current user context:
${contextSummary}

Analyze the override reason and suggest context rule updates that would prevent this mismatch in the future.`;

    const response = await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: 0.3,
        maxTokens: 800,
        userId,
      },
      provider,
      userId,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          suggestedRules: parsed.suggestedRules || [],
          updatedContexts: parsed.updatedContexts || [],
        };
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM override reason analysis response as JSON",
        error,
      );
    }

    return {
      suggestedRules: [],
      updatedContexts: [],
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

  /**
   * Analyze time patterns from hour arrays
   */
  private getTimePattern(hours: number[]): string {
    if (hours.length === 0) return "";

    // Count hours
    const hourCounts = new Map<number, number>();
    hours.forEach((h) => hourCounts.set(h, (hourCounts.get(h) || 0) + 1));

    // Find peak hours (hours with most activity)
    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (sortedHours.length === 0) return "";

    const peakHours = sortedHours
      .map(([hour, count]) => {
        const period = hour < 12 ? "AM" : "PM";
        const hour12 = hour % 12 || 12;
        return `${hour12}${period} (${count} emails)`;
      })
      .join(", ");

    return `Peak activity: ${peakHours}`;
  }

  async extractQAndA(
    userReplies: Array<{
      subject: string;
      body: string;
      receivedAt: string;
    }>,
    userId?: string,
    provider?: LLMProvider,
  ): Promise<Array<{ question: string; answer: string; frequency: number }>> {
    const systemPrompt = `You are an advanced email analyst. Analyze the user's email replies to extract common questions FROM OTHER PEOPLE that the user answers, and the user's typical responses.

CRITICAL: 
- Questions should be questions FROM OTHER PEOPLE TO THE USER (not questions the user asks)
- Answers should be the USER'S responses (what the user typically says when answering these questions)
- Only extract Q&A pairs that appear 3+ times (indicating they're truly common patterns)
- Answers must be SPECIFIC and ACTIONABLE - vague answers like "I inform recipients about flexible scheduling" are NOT helpful
- Answers should describe what the user actually says/does, not abstract descriptions

Output JSON array of objects:
[
  {
    "question": "The question FROM OTHER PEOPLE that the user commonly answers (abstracted/generalized)",
    "answer": "What the user typically says or does when answering this question (be SPECIFIC and concrete)",
    "frequency": number of times this Q&A pattern appears
  }
]

Focus on:
- Questions about availability/scheduling (e.g., "Are you available?", "When can we meet?")
- Questions about status/progress updates (e.g., "What's the status?", "How is X going?")
- Questions about decisions/approvals (e.g., "Can you approve?", "Should we do X?")
- Questions about technical details (e.g., "How does X work?", "Can you explain Y?")
- Questions about confirmations (e.g., "Did you receive?", "Can you confirm?")

Answer format examples:
- GOOD: "I confirm my attendance and mention any dietary requirements"
- GOOD: "I provide a specific date and time, asking about location details"
- BAD: "I inform recipients about flexible scheduling" (too vague)
- BAD: "I respond with scheduling information" (not specific enough)

Only include Q&A pairs that appear 3 or more times. Be abstract for questions but SPECIFIC for answers. Don't include specific dates, names, or project details in questions, but answers should be concrete about what the user does.`;

    // Remove quoted/replied content from user's emails to focus on their actual responses
    const cleanReplies = userReplies.map((e) => {
      let body = e.body;
      // Remove quoted content
      body = body
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('>')) return false;
          if (/^On .+ wrote:/i.test(trimmed)) return false;
          if (/^From:/i.test(trimmed)) return false;
          return true;
        })
        .join('\n');
      return `Subject: ${e.subject}\nBody: ${body.substring(0, 1000)}`;
    });

    const repliesText = cleanReplies.join("\n\n---\n\n");

    const prompt = `Analyze these user email replies to find common questions FROM OTHER PEOPLE that the user answers, and what the user typically says in response:\n\n${repliesText}`;

    const response = await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: 0.3,
        maxTokens: 1000,
        userId,
      },
      provider,
      userId,
    );

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return Array.isArray(parsed)
          ? parsed.filter((qa) => qa.frequency >= 3) // Require 3+ occurrences
          : [];
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM Q&A extraction response as JSON",
        error,
      );
    }

    return [];
  }

  async generateSearchRelevanceExplanation(
    query: string,
    email: {
      from: string;
      subject: string;
      body: string;
      receivedAt: string;
    },
    userId?: string,
    provider?: LLMProvider,
  ): Promise<string> {
    // Load prompt from markdown file
    const promptConfig = getPrompt("search-relevance-explanation");
    if (!promptConfig) {
      this.logger.error("search-relevance-explanation prompt not found");
      return "";
    }

    // Calculate days ago
    const receivedDate = new Date(email.receivedAt);
    const now = new Date();
    const daysAgo = Math.floor(
      (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const isRecent = daysAgo <= 7;
    const receivedAtText =
      daysAgo === 0
        ? "today"
        : daysAgo === 1
          ? "yesterday"
          : `${daysAgo} days ago`;

    // Render prompt with variables
    const fullPrompt = renderPrompt(promptConfig.prompt || "", {
      query,
      from: email.from,
      subject: email.subject,
      bodyPreview: email.body.substring(0, 500), // Increased to 500 for better context
      receivedAt: receivedAtText,
      isRecent: isRecent ? " (recent)" : "",
    });

    const response = await this.generateText(
      {
        prompt: fullPrompt,
        systemPrompt:
          "You are a helpful email search assistant. Provide concise, specific explanations.",
        temperature: 0.3,
        maxTokens: 150,
        userId,
      },
      provider,
      userId,
    );

    return response.trim();
  }

  /**
   * Generate explanations for multiple emails in a single batch call (faster than individual calls)
   */
  async generateSearchRelevanceExplanationsBatch(
    query: string,
    emails: Array<{
      index: number;
      from: string;
      subject: string;
      body: string;
      receivedAt: string;
    }>,
    userId?: string,
    provider?: LLMProvider,
  ): Promise<Map<number, string>> {
    if (emails.length === 0) {
      return new Map();
    }

    // Load prompt from markdown file
    const promptConfig = getPrompt("search-relevance-explanation");
    if (!promptConfig) {
      this.logger.error("search-relevance-explanation prompt not found");
      return new Map();
    }

    const now = new Date();
    const emailDetails = emails.map((email, idx) => {
      const receivedDate = new Date(email.receivedAt);
      const daysAgo = Math.floor(
        (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const receivedAtText =
        daysAgo === 0
          ? "today"
          : daysAgo === 1
            ? "yesterday"
            : `${daysAgo} days ago`;
      const isRecent = daysAgo <= 7;

      return {
        index: email.index,
        from: email.from,
        subject: email.subject,
        bodyPreview: email.body.substring(0, 300), // Slightly shorter for batch
        receivedAt: receivedAtText,
        isRecent: isRecent ? " (recent)" : "",
      };
    });

    // Render prompt from file with batch data
    // Ensure emails array is passed correctly
    if (!Array.isArray(emailDetails) || emailDetails.length === 0) {
      this.logger.warn(
        "generateSearchRelevanceExplanationsBatch called with empty or invalid emails array",
      );
      return new Map();
    }

    const fullPrompt = renderPrompt(promptConfig.prompt || "", {
      query,
      emails: emailDetails, // This should trigger {{#if emails}} to be true
    });

    // Log the rendered prompt to debug
    this.logger.debug(
      `Batch explanation: ${emails.length} emails, prompt length: ${fullPrompt.length}`,
    );
    this.logger.debug(
      `Rendered prompt preview (first 800 chars):\n${fullPrompt.substring(0, 800)}`,
    );

    // Verify the prompt contains the emails section
    if (!fullPrompt.includes("Email") || !fullPrompt.includes("index:")) {
      this.logger.error(
        "Rendered prompt does not contain email details! Prompt may not have rendered correctly.",
      );
      this.logger.error(`Full prompt:\n${fullPrompt}`);
    }

    try {
      const response = await this.generateText(
        {
          prompt: fullPrompt,
          systemPrompt:
            "You are a helpful email search assistant. Return only valid JSON objects.",
          temperature: 0.3,
          maxTokens: Math.min(2000, emails.length * 200), // Increased tokens for better responses
          userId,
        },
        provider,
        userId,
      );

      this.logger.debug(
        `Batch explanation response received. Length: ${response.length}, First 200 chars: ${response.substring(0, 200)}`,
      );

      // Parse JSON response - try multiple patterns
      let jsonStr: string | null = null;

      // Try 1: Direct JSON object
      const directMatch = response.match(/\{[\s\S]*\}/);
      if (directMatch) {
        jsonStr = directMatch[0];
      }

      // Try 2: JSON in markdown code block
      if (!jsonStr) {
        const codeBlockMatch = response.match(
          /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
        );
        if (codeBlockMatch && codeBlockMatch[1]) {
          jsonStr = codeBlockMatch[1];
        }
      }

      // Try 3: JSON after "Return" or similar text
      if (!jsonStr) {
        const afterTextMatch = response.match(
          /(?:return|json|result)[\s:]*(\{[\s\S]*\})/i,
        );
        if (afterTextMatch && afterTextMatch[1]) {
          jsonStr = afterTextMatch[1];
        }
      }

      if (jsonStr) {
        try {
          const explanations = JSON.parse(jsonStr);

          if (typeof explanations !== "object" || Array.isArray(explanations)) {
            throw new Error("Response is not a JSON object");
          }

          const result = new Map<number, string>();

          this.logger.debug(
            `Parsed JSON explanations. Type: ${typeof explanations}, Keys: ${Object.keys(explanations).join(", ")}`,
          );

          // Map explanations by index - try multiple key formats
          emailDetails.forEach((email) => {
            // Try: number key, string key, stringified number key
            const explanation =
              explanations[email.index] ||
              explanations[String(email.index)] ||
              explanations[email.index.toString()] ||
              explanations[`${email.index}`];

            if (
              explanation &&
              typeof explanation === "string" &&
              explanation.trim().length > 0
            ) {
              result.set(email.index, explanation.trim());
            } else {
              // Fallback explanation if batch generation missed it
              this.logger.warn(
                `Missing explanation for email index ${email.index}. Available keys: ${Object.keys(explanations).join(", ")}`,
              );
              result.set(
                email.index,
                `Relevant to "${query}" based on sender, subject, or content.`,
              );
            }
          });

          this.logger.debug(
            `Batch explanation complete. Generated ${result.size} explanations out of ${emails.length} emails.`,
          );

          if (result.size === 0) {
            this.logger.error(
              `No explanations generated! JSON keys: ${Object.keys(explanations).join(", ")}, Expected indices: ${emailDetails.map((e) => e.index).join(", ")}`,
            );
          }

          return result;
        } catch (parseError) {
          this.logger.error(
            `Failed to parse JSON from batch explanation response:`,
            parseError,
          );
          this.logger.error(
            `JSON string that failed to parse: ${jsonStr.substring(0, 500)}`,
          );
        }
      } else {
        this.logger.error(
          `Failed to find JSON in batch explanation response. Full response (first 1000 chars):\n${response.substring(0, 1000)}`,
        );
      }
    } catch (error) {
      this.logger.error("Batch explanation generation failed", error);
      this.logger.error(
        `Error details: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Fallback: return empty map (will trigger individual calls)
    return new Map();
  }
}
