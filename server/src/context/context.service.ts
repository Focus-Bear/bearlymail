import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import {
  UserContext,
  ContextKey,
  Source,
} from "../database/entities/user-context.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { getErrorMessage } from "../types/common";
import { GMAIL_LABELS } from "../constants/email-labels";
import { RATIOS } from "../constants/percentages";
import { DAYS } from "../constants/time-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";
import { ContextGmailDataService } from "./context-gmail-data.service";
import { ContextQaExtractionService } from "./context-qa-extraction.service";
import { writeAnalysisLog } from "./context-analysis-logger";
import { classifyContextAnalysisError } from "./context-error-handler";
import { Inject } from "@nestjs/common";
import PgBoss = require("pg-boss");
import { getJobPriority } from "../queue/job-priorities";

// eslint-disable-next-line max-lines
@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
  // Removed in-memory caches - now using database fields (analysisThreadCount, analysisAnalyzedCount, analysisStats)

  // eslint-disable-next-line max-params
  constructor(
    @InjectRepository(UserContext)
    private contextRepository: Repository<UserContext>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private threadRepository: Repository<EmailThread>,
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    private llmService: LLMService,
    private usersService: UsersService,
    private piiRedactionService: ContextPiiRedactionService,
    private gmailDataService: ContextGmailDataService,
    private qaExtractionService: ContextQaExtractionService,
    @Inject("PG_BOSS") private boss: PgBoss,
  ) {}

  /**
   * @deprecated Use ContextPiiRedactionService.redactPII instead
   * This method has been moved to ContextPiiRedactionService
   */
  private _deprecated_redactPII(text: string, userEmail?: string): string {
    // Common name patterns (capitalized words that might be names)
    // Replace with [Name] placeholder
    let redacted = text;

    // Remove email addresses (keep domain structure but redact user part)
    if (userEmail) {
      const emailRegex = new RegExp(
        userEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi",
      );
      redacted = redacted.replace(emailRegex, "[Your Email]");
    }

    // Pattern: Capitalized words that look like names (2+ capital letters, or single capital followed by lowercase)
    // This is a simple heuristic - in production you might want a more sophisticated approach
    // Match patterns like "Hi John," "Thanks Sarah", "Jeremy said", etc.
    const namePattern = /\b([A-Z][a-z]+)\b/g;
    const potentialNames = new Set<string>();
    let match;

    while ((match = namePattern.exec(text)) !== null) {
      const word = match[1];
      // Skip common words that aren't names
      const commonWords = [
        "Hi",
        "Hello",
        "Thanks",
        "Thank",
        "Best",
        "Regards",
        "Sincerely",
        "Dear",
        "Hello",
        "Hey",
        "The",
        "This",
        "That",
        "There",
        "These",
        "Those",
        "I",
        "You",
        "We",
        "They",
        "He",
        "She",
        "It",
        "A",
        "An",
        "And",
        "Or",
        "But",
        "If",
        "When",
        "Where",
        "What",
        "Who",
        "How",
        "Why",
        "Can",
        "Could",
        "Should",
        "Would",
        "Will",
        "May",
        "Might",
        "Must",
        "Have",
        "Has",
        "Had",
        "Do",
        "Does",
        "Did",
        "Is",
        "Are",
        "Was",
        "Were",
        "Be",
        "Been",
        "Being",
        "Get",
        "Got",
        "Giving",
        "Given",
        "Make",
        "Made",
        "Making",
        "Take",
        "Took",
        "Taking",
        "Taken",
        "See",
        "Saw",
        "Seeing",
        "Seen",
        "Know",
        "Knew",
        "Knowing",
        "Known",
        "Think",
        "Thought",
        "Thinking",
        "Say",
        "Said",
        "Saying",
        "Tell",
        "Told",
        "Telling",
        "Come",
        "Came",
        "Coming",
        "Go",
        "Went",
        "Going",
        "Gone",
        "Look",
        "Looked",
        "Looking",
        "Use",
        "Used",
        "Using",
        "Find",
        "Found",
        "Finding",
        "Give",
        "Gave",
        "Giving",
        "Given",
        "Work",
        "Worked",
        "Working",
        "Call",
        "Called",
        "Calling",
        "Try",
        "Tried",
        "Trying",
        "Ask",
        "Asked",
        "Asking",
        "Need",
        "Needed",
        "Needing",
        "Want",
        "Wanted",
        "Wanting",
        "Seem",
        "Seemed",
        "Seeming",
        "Help",
        "Helped",
        "Helping",
        "Show",
        "Showed",
        "Showing",
        "Shown",
        "Play",
        "Played",
        "Playing",
        "Move",
        "Moved",
        "Moving",
        "Live",
        "Lived",
        "Living",
        "Believe",
        "Believed",
        "Believing",
        "Bring",
        "Brought",
        "Bringing",
        "Happen",
        "Happened",
        "Happening",
        "Write",
        "Wrote",
        "Writing",
        "Written",
        "Sit",
        "Sat",
        "Sitting",
        "Stand",
        "Stood",
        "Standing",
        "Lose",
        "Lost",
        "Losing",
        "Pay",
        "Paid",
        "Paying",
        "Meet",
        "Met",
        "Meeting",
        "Include",
        "Included",
        "Including",
        "Continue",
        "Continued",
        "Continuing",
        "Set",
        "Setting",
        "Learn",
        "Learned",
        "Learning",
        "Change",
        "Changed",
        "Changing",
        "Lead",
        "Led",
        "Leading",
        "Understand",
        "Understood",
        "Understanding",
        "Watch",
        "Watched",
        "Watching",
        "Follow",
        "Followed",
        "Following",
        "Stop",
        "Stopped",
        "Stopping",
        "Create",
        "Created",
        "Creating",
        "Speak",
        "Spoke",
        "Speaking",
        "Spoken",
        "Read",
        "Reading",
        "Allow",
        "Allowed",
        "Allowing",
        "Add",
        "Added",
        "Adding",
        "Spend",
        "Spent",
        "Spending",
        "Grow",
        "Grew",
        "Growing",
        "Grown",
        "Open",
        "Opened",
        "Opening",
        "Walk",
        "Walked",
        "Walking",
        "Win",
        "Won",
        "Winning",
        "Offer",
        "Offered",
        "Offering",
        "Remember",
        "Remembered",
        "Remembering",
        "Love",
        "Loved",
        "Loving",
        "Consider",
        "Considered",
        "Considering",
        "Appear",
        "Appeared",
        "Appearing",
        "Buy",
        "Bought",
        "Buying",
        "Wait",
        "Waited",
        "Waiting",
        "Serve",
        "Served",
        "Serving",
        "Die",
        "Died",
        "Dying",
        "Send",
        "Sent",
        "Sending",
        "Build",
        "Built",
        "Building",
        "Stay",
        "Stayed",
        "Staying",
        "Fall",
        "Fell",
        "Falling",
        "Fallen",
        "Cut",
        "Cutting",
        "Reach",
        "Reached",
        "Reaching",
        "Kill",
        "Killed",
        "Killing",
        "Raise",
        "Raised",
        "Raising",
        "Pass",
        "Passed",
        "Passing",
        "Sell",
        "Sold",
        "Selling",
        "Decide",
        "Decided",
        "Deciding",
        "Return",
        "Returned",
        "Returning",
        "Join",
        "Joined",
        "Joining",
        "Agree",
        "Agreed",
        "Agreeing",
        "Support",
        "Supported",
        "Supporting",
        "Hit",
        "Hitting",
        "Produce",
        "Produced",
        "Producing",
        "Eat",
        "Ate",
        "Eating",
        "Eaten",
        "Cover",
        "Covered",
        "Covering",
        "Catch",
        "Caught",
        "Catching",
        "Draw",
        "Drew",
        "Drawing",
        "Drawn",
        "Choose",
        "Chose",
        "Choosing",
        "Chosen",
        "Succeed",
        "Succeeded",
        "Succeeding",
        "Fail",
        "Failed",
        "Failing",
        "Enjoy",
        "Enjoyed",
        "Enjoying",
        "Prevent",
        "Prevented",
        "Preventing",
        "Discover",
        "Discovered",
        "Discovering",
        "Prepare",
        "Prepared",
        "Preparing",
        "Manage",
        "Managed",
        "Managing",
        "Involve",
        "Involved",
        "Involving",
        "Report",
        "Reported",
        "Reporting",
        "Deal",
        "Dealt",
        "Dealing",
        "Face",
        "Faced",
        "Facing",
        "Accept",
        "Accepted",
        "Accepting",
        "Improve",
        "Improved",
        "Improving",
        "Raise",
        "Raised",
        "Raising",
        "Reduce",
        "Reduced",
        "Reducing",
        "Establish",
        "Established",
        "Establishing",
        "Receive",
        "Received",
        "Receiving",
        "Require",
        "Required",
        "Requiring",
        "Indicate",
        "Indicated",
        "Indicating",
        "Remember",
        "Remembered",
        "Remembering",
        "Forget",
        "Forgot",
        "Forgetting",
        "Forgotten",
        "Complete",
        "Completed",
        "Completing",
        "Concern",
        "Concerned",
        "Concerning",
        "Wonder",
        "Wondered",
        "Wondering",
        "Notice",
        "Noticed",
        "Noticing",
        "Depend",
        "Depended",
        "Depending",
        "Suggest",
        "Suggested",
        "Suggesting",
        "Realize",
        "Realized",
        "Realizing",
        "Recognize",
        "Recognized",
        "Recognizing",
        "Relate",
        "Related",
        "Relating",
        "Remain",
        "Remained",
        "Remaining",
        "Represent",
        "Represented",
        "Representing",
        "Respond",
        "Responded",
        "Responding",
        "Result",
        "Resulted",
        "Resulting",
        "Return",
        "Returned",
        "Returning",
        "Reveal",
        "Revealed",
        "Revealing",
        "Rise",
        "Rose",
        "Rising",
        "Risen",
        "Save",
        "Saved",
        "Saving",
        "Seek",
        "Sought",
        "Seeking",
        "Separate",
        "Separated",
        "Separating",
        "Serve",
        "Served",
        "Serving",
        "Share",
        "Shared",
        "Sharing",
        "Shoot",
        "Shot",
        "Shooting",
        "Shut",
        "Shutting",
        "Sing",
        "Sang",
        "Singing",
        "Sung",
        "Sink",
        "Sank",
        "Sinking",
        "Sunk",
        "Sleep",
        "Slept",
        "Sleeping",
        "Smile",
        "Smiled",
        "Smiling",
        "Solve",
        "Solved",
        "Solving",
        "Sound",
        "Sounded",
        "Sounding",
        "Spend",
        "Spent",
        "Spending",
        "Split",
        "Splitting",
        "Spread",
        "Spreading",
        "Spring",
        "Sprang",
        "Springing",
        "Sprung",
        "Stand",
        "Stood",
        "Standing",
        "Start",
        "Started",
        "Starting",
        "State",
        "Stated",
        "Stating",
        "Stay",
        "Stayed",
        "Staying",
        "Step",
        "Stepped",
        "Stepping",
        "Stick",
        "Stuck",
        "Sticking",
        "Strike",
        "Struck",
        "Striking",
        "Struck",
        "Study",
        "Studied",
        "Studying",
        "Supply",
        "Supplied",
        "Supplying",
        "Suppose",
        "Supposed",
        "Supposing",
        "Survive",
        "Survived",
        "Surviving",
        "Tackle",
        "Tackled",
        "Tackling",
        "Take",
        "Took",
        "Taking",
        "Taken",
        "Talk",
        "Talked",
        "Talking",
        "Taste",
        "Tasted",
        "Tasting",
        "Teach",
        "Taught",
        "Teaching",
        "Tell",
        "Told",
        "Telling",
        "Tend",
        "Tended",
        "Tending",
        "Test",
        "Tested",
        "Testing",
        "Thank",
        "Thanked",
        "Thanking",
        "Think",
        "Thought",
        "Thinking",
        "Throw",
        "Threw",
        "Throwing",
        "Thrown",
        "Touch",
        "Touched",
        "Touching",
        "Train",
        "Trained",
        "Training",
        "Travel",
        "Travelled",
        "Travelling",
        "Treat",
        "Treated",
        "Treating",
        "Trust",
        "Trusted",
        "Trusting",
        "Try",
        "Tried",
        "Trying",
        "Turn",
        "Turned",
        "Turning",
        "Understand",
        "Understood",
        "Understanding",
        "Unite",
        "United",
        "Uniting",
        "Value",
        "Valued",
        "Valuing",
        "Visit",
        "Visited",
        "Visiting",
        "Voice",
        "Voiced",
        "Voicing",
        "Wait",
        "Waited",
        "Waiting",
        "Wake",
        "Woke",
        "Waking",
        "Woken",
        "Walk",
        "Walked",
        "Walking",
        "Want",
        "Wanted",
        "Wanting",
        "Warn",
        "Warned",
        "Warning",
        "Wash",
        "Washed",
        "Washing",
        "Waste",
        "Wasted",
        "Wasting",
        "Watch",
        "Watched",
        "Watching",
        "Wave",
        "Waved",
        "Waving",
        "Wear",
        "Wore",
        "Wearing",
        "Worn",
        "Weigh",
        "Weighed",
        "Weighing",
        "Welcome",
        "Welcomed",
        "Welcoming",
        "Win",
        "Won",
        "Winning",
        "Wish",
        "Wished",
        "Wishing",
        "Wonder",
        "Wondered",
        "Wondering",
        "Work",
        "Worked",
        "Working",
        "Worry",
        "Worried",
        "Worrying",
        "Would",
        "Write",
        "Wrote",
        "Writing",
        "Written",
        "Wrong",
      ];
      if (!commonWords.includes(word)) {
        potentialNames.add(word);
      }
    }

    // Replace potential names with [Name] placeholder
    for (const name of potentialNames) {
      const nameRegex = new RegExp(`\\b${name}\\b`, "g");
      redacted = redacted.replace(nameRegex, "[Name]");
    }

    // Collapse multiple consecutive [Name] placeholders into a single [Name] or [Names]
    // Handle patterns like "[Name], [Name]" or "[Name] [Name]" -> "[Name]" or "[Names]"
    // First, handle comma-separated: "[Name], [Name]" -> "[Name]"
    redacted = redacted.replace(/\[Name\](?:\s*,\s*\[Name\])+/g, "[Name]");
    // Then handle space-separated: "[Name] [Name]" -> "[Name]" (if not part of a larger phrase)
    redacted = redacted.replace(/\[Name\]\s+\[Name\]/g, "[Name]");
    // Handle "and [Name]" patterns: "[Name] and [Name]" -> "[Name]"
    redacted = redacted.replace(/\[Name\]\s+and\s+\[Name\]/gi, "[Name]");

    return redacted;
  }

  /**
   * Check if two context values are similar/overlapping
   * Uses word overlap and key phrase matching to detect duplicates
   */
  private areContextValuesSimilar(value1: string, value2: string): boolean {
    const normalize = (inputString: string): string =>
      inputString
        .toLowerCase()
        .trim()
        // Remove punctuation
        .replace(/[^\w\s]/g, " ")
        // Normalize whitespace
        .replace(/\s+/g, " ");

    const v1 = normalize(value1);
    const v2 = normalize(value2);

    // Exact match after normalization
    if (v1 === v2) return true;

    // Check for significant word overlap (at least 60% of words match)
    // Ignore short words
    const words1 = new Set(v1.split(" ").filter((word) => word.length > 3));
    const words2 = new Set(v2.split(" ").filter((word) => word.length > 3));

    if (words1.size === 0 || words2.size === 0) return false;

    const intersection = new Set(
      [...words1].filter((word) => words2.has(word)),
    );
    const union = new Set([...words1, ...words2]);
    const similarity = intersection.size / union.size;

    // If 60%+ word overlap, consider them similar
    if (similarity >= RATIOS.SIXTY_PERCENT) return true;

    // Check for key phrase overlap (e.g., "PostHog", "document collaboration", "SOP review")
    // Extract key phrases (2-3 word sequences) and check for overlap
    const getKeyPhrases = (text: string): Set<string> => {
      // Lower threshold to catch "SOP"
      const words = text.split(" ").filter((word) => word.length > 2);
      const phrases = new Set<string>();
      // Add 2-word phrases
      for (let i = 0; i < words.length - 1; i++) {
        phrases.add(`${words[i]} ${words[i + 1]}`);
      }
      // Add 3-word phrases for important terms
      for (let i = 0; i < words.length - 2; i++) {
        phrases.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
      }
      return phrases;
    };

    const phrases1 = getKeyPhrases(v1);
    const phrases2 = getKeyPhrases(v2);

    // If they share key phrases (especially product names, project names), consider similar
    let sharedPhrases = 0;
    for (const phrase of phrases1) {
      if (phrases2.has(phrase)) {
        sharedPhrases++;
      }
    }

    // Also check for single important words (product names, project names) that appear in both
    const importantWords = [
      "posthog",
      "document",
      "collaboration",
      "sop",
      "review",
      "analytics",
      "integration",
    ];
    const v1Words = v1.split(" ");
    const v2Words = v2.split(" ");
    let sharedImportantWords = 0;
    for (const word of importantWords) {
      if (v1Words.includes(word) && v2Words.includes(word)) {
        sharedImportantWords++;
      }
    }

    // If they share 2+ key phrases OR 2+ important words, they're similar
    if (sharedPhrases >= 2 || sharedImportantWords >= 2) return true;

    return false;
  }

  async getUserContext(userId: string): Promise<UserContext[]> {
    return this.contextRepository.find({
      where: { userId },
      order: { lastModified: "DESC" },
    });
  }

  /**
   * Get progress information for analysis (thread count, analyzed count, stats, error message)
   * This allows the controller to access cache data without using 'as any'
   */
  async getAnalysisProgress(
    userId: string,
    analysisId?: string, // Add optional analysis ID parameter
  ): Promise<{
    threadCount?: number;
    analyzedCount?: number;
    stats?: Record<string, unknown>;
    errorMessage?: string;
    completedBatches?: number;
    totalBatches?: number;
    status?: "pending" | "running" | "completed" | "failed";
    insights?: Array<{ type: string; message: string }>;
    // Fetching progress fields
    fetchingStatus?: string;
    fetchedGeneral?: number;
    fetchedSent?: number;
  }> {
    let analysis: ContextAnalysis | null = null;

    if (analysisId) {
      // Get specific analysis by ID
      analysis = await this.contextAnalysisRepository.findOne({
        where: { id: analysisId, userId },
      });

      if (!analysis) {
        this.logger.debug(
          `[CONTEXT-ANALYSIS] Analysis ${analysisId} not found for user ${userId}`,
        );
        return {};
      }
    } else {
      // Fall back to most recent running/pending analysis (backward compatibility)
      // IMPORTANT: Only get analyses from the last hour to avoid picking up stale/corrupted analyses
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      analysis = await this.contextAnalysisRepository.findOne({
        where: [
          { userId, status: "running", createdAt: MoreThan(oneHourAgo) },
          { userId, status: "pending", createdAt: MoreThan(oneHourAgo) },
        ],
        order: { createdAt: "DESC" },
      });

      if (!analysis) {
        // Try without date filter as fallback (for analyses older than 1 hour)
        analysis = await this.contextAnalysisRepository.findOne({
          where: [
            { userId, status: "running" },
            { userId, status: "pending" },
          ],
          order: { createdAt: "DESC" },
        });
      }
    }

    // If no running/pending analysis, check if there's a recently completed one
    // (within last 5 minutes) - user might be viewing completion message
    if (!analysis) {
      const recentCompleted = await this.contextAnalysisRepository.findOne({
        where: { userId, status: "completed" },
        order: { createdAt: "DESC" },
      });

      // Only return completed analysis if it was completed very recently (< 5 min ago)
      if (recentCompleted && recentCompleted.updatedAt) {
        const completedAgo = Date.now() - recentCompleted.updatedAt.getTime();
        if (completedAgo < 5 * 60 * 1000) {
          // 5 minutes
          // Return completed analysis for completion message
          const completedAnalysis = recentCompleted;

          // Get batch completion status
          let completedBatches: number | undefined;
          let totalBatches: number | undefined;
          if (completedAnalysis.stats) {
            const batchResults =
              (completedAnalysis.stats.batchResults as Record<
                string,
                unknown
              >) || {};
            completedBatches = Object.keys(batchResults).length;

            if (completedAnalysis.stats.totalBatches) {
              totalBatches = completedAnalysis.stats.totalBatches as number;
            }
          }

          // Ensure completedBatches is always defined if totalBatches exists
          if (totalBatches !== undefined) {
            completedBatches =
              completedBatches !== undefined ? completedBatches : 0;
          }

          // Extract insights from completed analysis too
          const completedInsights: Array<{ type: string; message: string }> =
            [];
          if (completedAnalysis.stats?.batchResults) {
            const batchResults = completedAnalysis.stats.batchResults as Record<
              string,
              {
                context?: Array<{
                  key: string;
                  value: string;
                  source?: string;
                }>;
                writingStyle?: {
                  tone?: string;
                  style?: string;
                  commonPhrases?: string[];
                };
              }
            >;
            Object.entries(batchResults).forEach(([, result]) => {
              if (result.context) {
                result.context.forEach((ctx) => {
                  const keyLower = ctx.key.toLowerCase();
                  if (
                    keyLower.includes("vip") ||
                    keyLower.includes("contact") ||
                    keyLower.includes("important")
                  ) {
                    completedInsights.push({
                      type: "vip",
                      message: `Found important contact: ${ctx.value}`,
                    });
                  } else if (
                    keyLower.includes("style") ||
                    keyLower.includes("tone")
                  ) {
                    completedInsights.push({
                      type: "style",
                      message: `Your communication style: ${ctx.value}`,
                    });
                  } else if (
                    keyLower.includes("working") ||
                    keyLower.includes("project") ||
                    keyLower.includes("team")
                  ) {
                    completedInsights.push({
                      type: "project",
                      message: `Current focus: ${ctx.value}`,
                    });
                  } else {
                    completedInsights.push({
                      type: "pattern",
                      message: `${ctx.key}: ${ctx.value}`,
                    });
                  }
                });
              }
              if (result.writingStyle) {
                // Filter out batch-specific "no sent emails" messages, N/A, and empty values (same as active analysis)
                const styleText =
                  `${result.writingStyle.tone || ""} ${result.writingStyle.style || ""}`.trim();
                const styleLower = styleText.toLowerCase();

                // Check for N/A patterns (exact match, or starts with N/A followed by error text)
                const isNAPattern =
                  styleText === "n/a" ||
                  styleText === "n/a n/a" ||
                  styleLower.startsWith("n/a") ||
                  styleLower.startsWith("n/a -") ||
                  styleLower.match(
                    /^n\/a\s*-?\s*(no|unable|not available|absence)/i,
                  );

                const isBatchSpecificError =
                  styleLower.includes("no sent emails") ||
                  styleLower.includes("no user sent emails") ||
                  styleLower.includes("unable to analyze") ||
                  styleLower.includes("not available") ||
                  styleLower.includes("absence of sent email") ||
                  styleLower.includes("not analyzable") ||
                  isNAPattern ||
                  styleText === "";

                if (styleText && !isBatchSpecificError) {
                  completedInsights.push({
                    type: "style",
                    message: `Writing style: ${styleText}`,
                  });
                }

                if (
                  result.writingStyle.commonPhrases &&
                  result.writingStyle.commonPhrases.length > 0
                ) {
                  // Also filter common phrases if they're error messages or meaningless
                  const phrases = result.writingStyle.commonPhrases.filter(
                    (phrase) => {
                      const phraseLower = phrase.toLowerCase();
                      return (
                        !phraseLower.includes("no sent emails") &&
                        !phraseLower.includes("no user sent emails") &&
                        !phraseLower.includes("unable to analyze") &&
                        !phraseLower.includes("not available") &&
                        !phraseLower.includes("not analyzable") &&
                        phraseLower !== "n/a" &&
                        phrase.trim() !== ""
                      );
                    },
                  );

                  if (phrases.length > 0) {
                    completedInsights.push({
                      type: "phrases",
                      message: `Common phrases: ${phrases.slice(0, 3).join(", ")}`,
                    });
                  }
                }
              }
            });
          }

          // Deduplicate completed insights by message content
          const seenCompletedMessages = new Set<string>();
          const uniqueCompletedInsights = completedInsights.filter(
            (insight) => {
              if (seenCompletedMessages.has(insight.message)) {
                return false;
              }
              seenCompletedMessages.add(insight.message);
              return true;
            },
          );

          return {
            threadCount: completedAnalysis.threadCount ?? undefined,
            analyzedCount: completedAnalysis.analyzedCount ?? undefined,
            stats: completedAnalysis.stats ?? undefined,
            errorMessage: undefined,
            completedBatches,
            totalBatches,
            status: "completed",
            insights:
              uniqueCompletedInsights.slice(-10).reverse().length > 0
                ? uniqueCompletedInsights.slice(-10).reverse()
                : undefined,
          };
        }
      }

      // No active or recent analysis - check for failed analysis too
      const recentFailed = await this.contextAnalysisRepository.findOne({
        where: { userId, status: "failed" },
        order: { createdAt: "DESC" },
      });

      if (recentFailed && recentFailed.updatedAt) {
        const failedAgo = Date.now() - recentFailed.updatedAt.getTime();
        if (failedAgo < 5 * 60 * 1000) {
          // 5 minutes
          return {
            threadCount: recentFailed.threadCount ?? undefined,
            analyzedCount: recentFailed.analyzedCount ?? undefined,
            stats: recentFailed.stats ?? undefined,
            errorMessage: recentFailed.errorMessage ?? undefined,
            status: "failed",
          };
        }
      }

      // No active or recent analysis
      this.logger.debug(
        `[CONTEXT-ANALYSIS] No active or recent analysis found for user ${userId}`,
      );
      return {};
    }

    // Get batch completion status
    let completedBatches: number | undefined;
    let totalBatches: number | undefined;
    if (analysis.stats) {
      const batchResults =
        (analysis.stats.batchResults as Record<string, unknown>) || {};
      completedBatches = Object.keys(batchResults).length;

      // Get totalBatches from stats (should be set when batches are enqueued)
      if (analysis.stats.totalBatches) {
        totalBatches = analysis.stats.totalBatches as number;
      }
      // If totalBatches is not in stats yet, don't estimate - return undefined
      // This prevents false "all batches complete" detection

      // Log batch status for debugging
      this.logger.log(
        `[PROGRESS-CALC] Analysis ${analysis.id}: completedBatches=${completedBatches}, totalBatches=${totalBatches}, batchResults keys: ${Object.keys(batchResults).slice(0, 10).join(", ")}${Object.keys(batchResults).length > 10 ? "..." : ""}`,
      );
    } else {
      this.logger.warn(`[PROGRESS-CALC] Analysis ${analysis.id} has no stats!`);
    }

    // Initialize completedBatches to 0 if we have totalBatches but no batch results yet
    if (totalBatches !== undefined) {
      completedBatches = completedBatches !== undefined ? completedBatches : 0;
      this.logger.log(
        `[PROGRESS-CALC] After initialization: completedBatches=${completedBatches}, totalBatches=${totalBatches}, calculated percent: ${Math.floor((completedBatches / totalBatches) * 100)}%`,
      );
    }

    // Extract insights from completed batch results
    const insights: Array<{ type: string; message: string }> = [];

    if (analysis.stats?.batchResults) {
      const batchResults = analysis.stats.batchResults as Record<
        string,
        {
          context?: Array<{ key: string; value: string; source?: string }>;
          writingStyle?: {
            tone?: string;
            style?: string;
            commonPhrases?: string[];
          };
          completedAt?: string;
        }
      >;

      // Iterate through completed batches and extract insights
      Object.entries(batchResults).forEach(([, result]) => {
        if (result.context) {
          result.context.forEach((ctx) => {
            // Format context items as insights
            const keyLower = ctx.key.toLowerCase();
            const valueLower = ctx.value.toLowerCase();

            // Check for non-importance indicators in the value (e.g., "archived unread", "without replies", "deprioritization")
            const nonImportantIndicators = [
              "archived unread",
              "without replies",
              "deprioritization",
              "low priority",
              "not replied",
              "ignored",
              "unopened",
              "not important",
            ];
            const isActuallyImportant = !nonImportantIndicators.some(
              (indicator) => valueLower.includes(indicator),
            );

            if (
              (keyLower.includes("vip") ||
                keyLower.includes("contact") ||
                keyLower.includes("important")) &&
              isActuallyImportant
            ) {
              insights.push({
                type: "vip",
                message: `Analyzed importance of contact: ${ctx.value}`,
              });
            } else if (
              keyLower.includes("vip") ||
              keyLower.includes("contact") ||
              keyLower.includes("important")
            ) {
              // Has VIP-related key but value indicates non-importance - skip or mark as pattern instead
              // Skip this insight - don't show "important contact" if it's not actually important
            } else if (
              keyLower.includes("style") ||
              keyLower.includes("tone")
            ) {
              insights.push({
                type: "style",
                message: `Your communication style: ${ctx.value}`,
              });
            } else if (
              keyLower.includes("working") ||
              keyLower.includes("project") ||
              keyLower.includes("team")
            ) {
              insights.push({
                type: "project",
                message: `Current focus: ${ctx.value}`,
              });
            }
            // Skip "OTHER" insights completely - they're just garbage
          });
        }

        if (result.writingStyle) {
          // Filter out batch-specific "no sent emails" messages, N/A, and empty values
          // Only include if the message is meaningful and not batch-specific error text
          const styleText =
            `${result.writingStyle.tone || ""} ${result.writingStyle.style || ""}`.trim();
          const styleLower = styleText.toLowerCase();

          // Check for N/A patterns (exact match, or starts with N/A followed by error text)
          const isNAPattern =
            styleText === "n/a" ||
            styleText === "n/a n/a" ||
            styleLower.startsWith("n/a") ||
            styleLower.startsWith("n/a -") ||
            styleLower.match(/^n\/a\s*-?\s*(no|unable|not available|absence)/i);

          const isBatchSpecificError =
            styleLower.includes("no sent emails") ||
            styleLower.includes("no user sent emails") ||
            styleLower.includes("unable to analyze") ||
            styleLower.includes("not available") ||
            styleLower.includes("absence of sent email") ||
            styleLower.includes("not analyzable") ||
            isNAPattern ||
            styleText === "";

          if (styleText && !isBatchSpecificError) {
            insights.push({
              type: "style",
              message: `Writing style: ${styleText}`,
            });
          }

          if (
            result.writingStyle.commonPhrases &&
            result.writingStyle.commonPhrases.length > 0
          ) {
            // Also filter common phrases if they're error messages or meaningless
            const phrases = result.writingStyle.commonPhrases.filter(
              (phrase) => {
                const phraseLower = phrase.toLowerCase();
                return (
                  !phraseLower.includes("no sent emails") &&
                  !phraseLower.includes("no user sent emails") &&
                  !phraseLower.includes("unable to analyze") &&
                  !phraseLower.includes("not available") &&
                  !phraseLower.includes("not analyzable") &&
                  phraseLower !== "n/a" &&
                  phrase.trim() !== ""
                );
              },
            );

            if (phrases.length > 0) {
              insights.push({
                type: "phrases",
                message: `Common phrases: ${phrases.slice(0, 3).join(", ")}`,
              });
            }
          }
        }
      });
    }

    // Deduplicate insights by message content before limiting
    const seenMessages = new Set<string>();
    const uniqueInsights = insights.filter((insight) => {
      if (seenMessages.has(insight.message)) {
        return false;
      }
      seenMessages.add(insight.message);
      return true;
    });

    // Return most recent unique insights (limit to 10, most recent first)
    const recentInsights = uniqueInsights.slice(-10).reverse();

    // Read fetching status from separate columns (not stats) to avoid race condition issues
    const fetchingStatus = analysis.fetchingStatus ?? undefined;
    const fetchedGeneral = analysis.fetchedGeneralCount ?? undefined;
    const fetchedSent = analysis.fetchedSentCount ?? undefined;

    return {
      threadCount: analysis.threadCount ?? undefined,
      analyzedCount: analysis.analyzedCount ?? undefined,
      stats: analysis.stats ?? undefined,
      errorMessage:
        analysis.status === "failed"
          ? (analysis.errorMessage ?? undefined)
          : undefined,
      completedBatches,
      totalBatches,
      status: analysis.status,
      insights: recentInsights.length > 0 ? recentInsights : undefined,
      // Fetching progress (from separate columns)
      fetchingStatus,
      fetchedGeneral,
      fetchedSent,
    };
  }

  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
  async analyzeAndLearnFromEmails(
    userId: string,
    analysisId?: string, // Optional - if provided, use that analysis record
  ): Promise<void> {
    // eslint-disable-next-line max-lines
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const startTime = Date.now();
    this.logger.log(
      `[CONTEXT-ANALYSIS] ===== Starting deep email analysis for user ${userId}${analysisId ? ` with analysis ID ${analysisId}` : ""} =====`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[CONTEXT-SERVICE] ===== Starting deep email analysis for user ${userId}${analysisId ? ` with analysis ID ${analysisId}` : ""} =====`,
    );
    writeAnalysisLog(
      `===== Starting deep email analysis for user ${userId}${analysisId ? ` with analysis ID ${analysisId}` : ""} =====`,
      "log",
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Services initialized: piiRedaction=${!!this.piiRedactionService}, gmailData=${!!this.gmailDataService}, qaExtraction=${!!this.qaExtractionService}`,
    );
    writeAnalysisLog(
      `Services initialized: piiRedaction=${!!this.piiRedactionService}, gmailData=${!!this.gmailDataService}, qaExtraction=${!!this.qaExtractionService}`,
      "debug",
    );

    // Create or get the current analysis record (declare outside try so it's accessible in catch)
    let analysisRecord: ContextAnalysis;

    if (analysisId) {
      // Use provided analysis record
      analysisRecord = await this.contextAnalysisRepository.findOne({
        where: { id: analysisId, userId },
      });

      if (!analysisRecord) {
        throw new Error(
          `Analysis record ${analysisId} not found for user ${userId}`,
        );
      }
    } else {
      // Existing logic - find or create
      analysisRecord = await this.contextAnalysisRepository.findOne({
        where: { userId, status: "running" },
        order: { createdAt: "DESC" },
      });

      if (!analysisRecord) {
        // Create new analysis record with initialized stats
        analysisRecord = this.contextAnalysisRepository.create({
          userId,
          status: "running",
          progress: 0,
          total: 100,
          stats: {
            totalThreads: 0,
            outboundEmails: 0,
            threadsNeverOpened: 0,
            threadsReadButNotReplied: 0,
            vipContactsEvaluated: 0,
          },
        });
        analysisRecord =
          await this.contextAnalysisRepository.save(analysisRecord);
        this.logger.log(
          `[CONTEXT-ANALYSIS] Created new analysis record ${analysisRecord.id} with initialized stats`,
        );
      } else {
        // CRITICAL: Reset ALL stats to prevent stale data from previous runs
        // This fixes the issue where progress jumps around due to old batchResults/totalBatches
        analysisRecord.status = "running";
        analysisRecord.progress = 0;
        analysisRecord.total = 100;
        analysisRecord.threadCount = undefined;
        analysisRecord.analyzedCount = 0;
        analysisRecord.stats = {
          totalThreads: 0,
          outboundEmails: 0,
          threadsNeverOpened: 0,
          threadsReadButNotReplied: 0,
          vipContactsEvaluated: 0,
          // IMPORTANT: Reset all batch-related data to prevent progress jumping
          batchResults: {},
          batchJobIds: {},
          batchPayloadsForRetry: {},
          totalBatches: 0,
        };
        // Reset fetching progress columns (separate from stats to avoid race conditions)
        analysisRecord.fetchingStatus = null;
        analysisRecord.fetchedGeneralCount = 0;
        analysisRecord.fetchedSentCount = 0;
        await this.contextAnalysisRepository.save(analysisRecord);
        this.logger.log(
          `[CONTEXT-ANALYSIS] Reset stats for existing analysis record ${analysisRecord.id} to prevent stale data`,
        );
      }
    }

    try {
      this.logger.log(
        `[CONTEXT-ANALYSIS] Step 1: Starting analysis setup for user ${userId}`,
      );
      // Step 1: Fetch threads for analysis (0-20%)
      // Analyze threads from 5-12 days ago to get a better sense of priorities
      // This gives enough time for user to review while providing more data
      this.logger.log(
        `[CONTEXT-ANALYSIS] Updating user scan progress to 0/100`,
      );
      await this.usersService.update(userId, {
        scanProgress: 0,
        scanTotal: 100,
      });
      this.logger.log(`[CONTEXT-ANALYSIS] User scan progress updated`);

      // Update analysis record - reset progress to 0 for new analysis
      this.logger.log(
        `[CONTEXT-ANALYSIS] Creating new analysis record (id: ${analysisRecord.id}) - progress reset to 0`,
      );
      analysisRecord.progress = 0;
      analysisRecord.total = 100;
      analysisRecord.analyzedCount = 0; // Ensure analyzedCount starts at 0
      await this.contextAnalysisRepository.save(analysisRecord);

      // Also reset user.scanProgress to 0 to prevent fallback to old progress
      await this.usersService.update(userId, {
        scanProgress: 0,
        scanTotal: 100,
      });

      this.logger.log(
        `[CONTEXT-ANALYSIS] ✅ Analysis record and user progress reset to 0 for new analysis`,
      );

      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const twelveDaysAgo = new Date();
      twelveDaysAgo.setDate(twelveDaysAgo.getDate() - DAYS.TWELVE);

      // Get user's email to exclude from VIP contacts
      const userForEmail = await this.usersService.findOne(userId);
      const userEmail = userForEmail?.email
        ? userForEmail.email.toLowerCase()
        : null;

      // Query email provider for thread IDs only (quick operation)
      // This allows the main job to complete quickly and queue batch jobs
      this.logger.log(
        `[CONTEXT-ANALYSIS] Getting thread IDs from 5-12 days ago (quick operation)`,
      );
      writeAnalysisLog(`Getting thread IDs from 5-12 days ago`, "log");

      // Update progress to show fetching status (use separate columns to avoid race conditions)
      analysisRecord.fetchingStatus = "Fetching general threads...";
      analysisRecord.fetchedGeneralCount = 0;
      analysisRecord.fetchedSentCount = 0;
      await this.contextAnalysisRepository.save(analysisRecord);

      // Fetch 300 general threads from 5-12 days ago (inbox)
      const generalThreadIds =
        await this.gmailDataService.getThreadIdsFromGmail(
          userId,
          twelveDaysAgo,
          fiveDaysAgo,
          300, // Limit to 300 threads
        );

      // Update progress with general threads count (use separate columns)
      analysisRecord.fetchingStatus = "Fetching sent threads...";
      analysisRecord.fetchedGeneralCount = generalThreadIds.length;
      analysisRecord.fetchedSentCount = 0;
      await this.contextAnalysisRepository.save(analysisRecord);

      this.logger.log(
        `[CONTEXT-ANALYSIS] Found ${generalThreadIds.length} general threads from 5-12 days ago`,
      );
      writeAnalysisLog(
        `Found ${generalThreadIds.length} general threads from 5-12 days ago`,
        "log",
      );

      // Fetch 150 most recent user-initiated sent threads (to ensure ~100 unique after dedup)
      let sentThreadIds: string[] = [];
      try {
        sentThreadIds = await this.gmailDataService.getSentThreadIds(
          userId,
          150, // Fetch 150 to ensure ~100 unique after dedup with general threads
        );

        // Update progress with sent threads count
        // Update fetching progress (use separate columns to avoid race conditions)
        analysisRecord.fetchingStatus = "Combining threads...";
        analysisRecord.fetchedGeneralCount = generalThreadIds.length;
        analysisRecord.fetchedSentCount = sentThreadIds.length;
        await this.contextAnalysisRepository.save(analysisRecord);

        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${sentThreadIds.length} most recent sent thread IDs`,
        );
        writeAnalysisLog(
          `Found ${sentThreadIds.length} most recent sent thread IDs`,
          "log",
        );
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        this.logger.warn(
          `[CONTEXT-ANALYSIS] WARNING: Failed to fetch sent thread IDs: ${errorMessage}. Continuing with general threads only.`,
        );
        writeAnalysisLog(
          `WARNING: Failed to fetch sent thread IDs: ${errorMessage}. Continuing with general threads only.`,
          "warn",
        );
        // Continue without sent threads if fetch fails
      }

      // Combine both thread ID lists
      const allThreadIds = [...generalThreadIds, ...sentThreadIds];

      // Deduplicate thread IDs (in case a sent thread overlaps with general threads)
      const threadIds = Array.from(new Set(allThreadIds));

      // Clear fetching status now that we have thread IDs (use separate columns)
      analysisRecord.fetchingStatus = null;
      analysisRecord.fetchedGeneralCount = generalThreadIds.length;
      analysisRecord.fetchedSentCount = sentThreadIds.length;
      // Keep uniqueThreads in stats as it's not updated by batch processors
      analysisRecord.stats = {
        ...(analysisRecord.stats || {}),
        uniqueThreads: threadIds.length,
      };
      await this.contextAnalysisRepository.save(analysisRecord);

      const totalThreads = threadIds.length;
      this.logger.log(
        `[CONTEXT-ANALYSIS] Found ${generalThreadIds.length} general threads and ${sentThreadIds.length} sent threads (${totalThreads} unique total) for user ${userId}`,
      );
      writeAnalysisLog(
        `Found ${generalThreadIds.length} general threads and ${sentThreadIds.length} sent threads (${totalThreads} unique total) for user ${userId}`,
        "log",
      );

      if (totalThreads === 0) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] ERROR: No threads found in date range (5-12 days ago) for user ${userId}. Analysis cannot proceed.`,
        );
        await this.usersService.update(userId, {
          scanProgress: -1,
          scanTotal: 100,
        });
        throw new Error(
          "No threads found in the analysis date range. Please ensure you have emails from 5-12 days ago.",
        );
      }

      // Clear findings from stats now that fetching is complete (but preserve existing stats like totalBatches)
      if (analysisRecord.stats) {
        // Only clear findings if they exist, preserve all other stats (especially totalBatches, batchJobIds, etc.)
        if (analysisRecord.stats.findings as string[]) {
          const stats = { ...analysisRecord.stats };
          delete stats.findings;
          analysisRecord.stats = stats;
          await this.contextAnalysisRepository.save(analysisRecord);
          this.logger.log(
            `[CONTEXT-ANALYSIS] Cleared findings from stats (preserved totalBatches: ${(analysisRecord.stats.totalBatches as number) || "not set"})`,
          );
        }
      }

      // Reset progress to 0 when starting new analysis (prevents showing old progress like 48%)
      await this.usersService.update(userId, {
        scanProgress: 0, // Start at 0, not 10
        scanTotal: 100,
      });
      this.logger.log(
        `[CONTEXT-ANALYSIS] Starting analysis for ${totalThreads} threads (progress reset to 0%)`,
      );

      // Store thread count in analysis record and RESET batch-related stats for fresh start
      analysisRecord.threadCount = totalThreads;
      analysisRecord.analyzedCount = 0;

      // CRITICAL: Reset ALL batch-related stats to prevent stale data from previous runs
      // This is the source of bugs like:
      // - Progress jumping to 85% (old completedBatches >= new totalBatches)
      // - Old insights showing before new analysis
      // - analyzedCount exceeding threadCount
      analysisRecord.stats = {
        // Reset counters
        totalThreads: 0,
        outboundEmails: 0,
        threadsNeverOpened: 0,
        threadsReadButNotReplied: 0,
        vipContactsEvaluated: 0,
        // CRITICAL: Clear these to start fresh
        batchResults: {}, // Clear old batch results
        batchJobIds: {}, // Clear old job ID mappings
        batchPayloadsForRetry: {}, // Clear old retry payloads
        totalBatches: 0, // Will be set once all batches are enqueued
      };

      this.logger.log(
        `[CONTEXT-ANALYSIS] ✅ Reset batch stats for fresh analysis (batchResults cleared, totalBatches=0)`,
      );

      await this.contextAnalysisRepository.save(analysisRecord);

      // Get sent email threads from Gmail using the Gmail data service
      // This uses SENT label only (no From header matching or fallback to messages[0])
      // Use a wider date range (90 days) to capture more sent emails for writing style analysis
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const today = new Date();

      this.logger.log(
        `[CONTEXT-ANALYSIS] Fetching sent email threads from last 90 days (target: 100 threads)`,
      );

      // Get sent emails (quick operation - only 100 threads)
      this.logger.log(
        `[CONTEXT-ANALYSIS] About to fetch sent emails from Gmail data service`,
      );
      writeAnalysisLog(
        `About to fetch sent emails from Gmail data service`,
        "debug",
      );
      const sentEmailsData =
        await this.gmailDataService.fetchSentThreadsFromGmail(
          userId,
          userEmail || "",
          ninetyDaysAgo,
          today,
          100, // Target 100 sent threads
        );

      this.logger.log(
        `[CONTEXT-ANALYSIS] Successfully fetched ${sentEmailsData.length} sent emails from Gmail data service`,
      );
      writeAnalysisLog(
        `Successfully fetched ${sentEmailsData.length} sent emails from Gmail data service`,
        "log",
      );

      const sentPayload = sentEmailsData.map((email) => ({
        emailId: email.id,
        to: "recipient@example.com",
        subject: email.subject,
        body: cleanEmailContent(email.body, email.htmlBody, 1000),
        sentAt: email.receivedAt.toISOString(),
      }));

      // Initialize stats (VIP contacts will be calculated in finalization job)
      const analysisStats = {
        totalThreads,
        outboundEmails: sentEmailsData.length,
        threadsNeverOpened: 0,
        threadsReadButNotReplied: 0,
        vipContactsEvaluated: 0,
      };

      // Progress is already set to 0 earlier when analysis record is created
      // Don't set it to 10 here - keep it at 0 until actual work starts

      // Get current context to avoid duplicates
      const existingContext = await this.getUserContext(userId);
      const currentContextForPrompt = existingContext.map((ctx) => ({
        key: ctx.contextKey,
        value: ctx.contextValue,
        source: ctx.source,
      }));

      // Step 2: Fetch threads progressively in batches of 30, start analysis jobs as batches are ready
      // This avoids waiting for all 400 threads to be fetched before starting analysis
      const FETCH_BATCH_SIZE = 30; // Fetch 30 threads at a time
      const ANALYSIS_BATCH_SIZE = 10; // Process 10 threads per analysis batch

      this.logger.log(
        `[CONTEXT-ANALYSIS] Fetching threads progressively (${FETCH_BATCH_SIZE} at a time) and starting analysis jobs as ready...`,
      );
      writeAnalysisLog(
        `Fetching threads progressively (${FETCH_BATCH_SIZE} at a time) and starting analysis jobs as ready...`,
        "log",
      );

      const allProcessedBatches: Array<
        Array<{
          threadId?: string;
          from: string;
          fromName?: string;
          subject: string;
          body: string;
          receivedAt: string;
          isRead?: boolean;
          timeToReply?: number | null;
          starCount?: number;
          isArchived?: boolean;
        }>
      > = [];
      let globalBatchIndex = 0;
      const jobPromises: Promise<{ jobId: string | null; batchNum: number }>[] =
        [];
      const enqueueErrors: Array<{ batchNum: number; error: string }> = [];

      // Fetch threads in batches of 30, process and enqueue analysis jobs as they're ready
      for (
        let fetchBatchStart = 0;
        fetchBatchStart < threadIds.length;
        fetchBatchStart += FETCH_BATCH_SIZE
      ) {
        const fetchBatchEnd = Math.min(
          fetchBatchStart + FETCH_BATCH_SIZE,
          threadIds.length,
        );
        const fetchBatchThreadIds = threadIds.slice(
          fetchBatchStart,
          fetchBatchEnd,
        );

        const fetchBatchStartTime = Date.now();
        const fetchedThreads = await this.gmailDataService.fetchThreadsByIds(
          userId,
          fetchBatchThreadIds,
        );
        const fetchBatchDuration = Date.now() - fetchBatchStartTime;

        this.logger.log(
          `[CONTEXT-ANALYSIS] ✅ Fetched batch ${Math.floor(fetchBatchStart / FETCH_BATCH_SIZE) + 1}: ${fetchedThreads.length}/${fetchBatchThreadIds.length} threads in ${Math.round(fetchBatchDuration / 1000)}s`,
        );

        if (fetchedThreads.length === 0) {
          this.logger.warn(
            `[CONTEXT-ANALYSIS] ⚠️ No threads fetched for batch ${Math.floor(fetchBatchStart / FETCH_BATCH_SIZE) + 1} (expected ${fetchBatchThreadIds.length})`,
          );
        }

        // Process fetched threads into analysis batch payloads

        // Process threads into payloads (same logic as before)
        const processedBatches: Array<
          Array<{
            threadId?: string;
            from: string;
            fromName?: string;
            subject: string;
            body: string;
            receivedAt: string;
            isRead?: boolean;
            timeToReply?: number | null;
            starCount?: number;
            isArchived?: boolean;
          }>
        > = [];

        this.logger.log(
          `[CONTEXT-ANALYSIS] Processing ${fetchedThreads.length} fetched threads into analysis batches of ${ANALYSIS_BATCH_SIZE}...`,
        );

        if (fetchedThreads.length === 0) {
          this.logger.warn(
            `[CONTEXT-ANALYSIS] ⚠️ No threads to process for fetch batch ${Math.floor(fetchBatchStart / FETCH_BATCH_SIZE) + 1}`,
          );
        }

        for (let i = 0; i < fetchedThreads.length; i += ANALYSIS_BATCH_SIZE) {
          const analysisBatchThreads = fetchedThreads.slice(
            i,
            i + ANALYSIS_BATCH_SIZE,
          );

          this.logger.log(
            `[CONTEXT-ANALYSIS] Processing analysis batch ${Math.floor(i / ANALYSIS_BATCH_SIZE) + 1} with ${analysisBatchThreads.length} threads...`,
          );

          const batchPayloads = analysisBatchThreads
            .map((thread) => {
              const firstEmail = thread.emails?.sort(
                (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
              )[0];
              if (!firstEmail) {
                this.logger.warn(
                  `[CONTEXT-ANALYSIS] ⚠️ Thread ${thread.id} has no emails, skipping`,
                );
                return null;
              }

              const userReplied = thread.emails?.some(
                (email) =>
                  email.labelIds?.includes(GMAIL_LABELS.SENT) ||
                  (userEmail &&
                    email.from.toLowerCase() === userEmail.toLowerCase()),
              );

              let quickestReply: number | null = null;
              if (userReplied) {
                const sentEmails = thread.emails.filter(
                  (email) =>
                    email.labelIds?.includes(GMAIL_LABELS.SENT) ||
                    (userEmail &&
                      email.from.toLowerCase() === userEmail.toLowerCase()),
                );
                const receivedEmails = thread.emails.filter(
                  (email) =>
                    !email.labelIds?.includes(GMAIL_LABELS.SENT) &&
                    (!userEmail ||
                      email.from.toLowerCase() !== userEmail.toLowerCase()),
                );

                if (sentEmails.length > 0 && receivedEmails.length > 0) {
                  const firstReceived = receivedEmails[0].receivedAt;
                  const firstSent = sentEmails[0].receivedAt;
                  const replyTimeHours =
                    (firstSent.getTime() - firstReceived.getTime()) /
                    (1000 * 60 * 60);
                  if (replyTimeHours >= 0) {
                    quickestReply = replyTimeHours * 60; // Convert to minutes
                  }
                }
              }

              return {
                threadId: thread.id,
                from: firstEmail.from,
                fromName: firstEmail.fromName,
                subject: firstEmail.subject,
                body: cleanEmailContent(
                  firstEmail.body,
                  firstEmail.htmlBody,
                  1000,
                ),
                receivedAt: firstEmail.receivedAt.toISOString(),
                isRead: firstEmail.isRead,
                timeToReply: quickestReply,
                starCount: thread.starCount || 0,
                isArchived: thread.isArchived || false,
              };
            })
            .filter((t) => t !== null) as Array<{
            threadId?: string;
            from: string;
            fromName?: string;
            subject: string;
            body: string;
            receivedAt: string;
            isRead?: boolean;
            timeToReply?: number | null;
            starCount?: number;
            isArchived?: boolean;
          }>;

          if (batchPayloads.length === 0) {
            this.logger.warn(
              `[CONTEXT-ANALYSIS] ⚠️ Analysis batch ${Math.floor(i / ANALYSIS_BATCH_SIZE) + 1} has 0 payloads after processing (all threads had no emails?)`,
            );
          } else {
            this.logger.log(
              `[CONTEXT-ANALYSIS] ✅ Created analysis batch ${Math.floor(i / ANALYSIS_BATCH_SIZE) + 1} with ${batchPayloads.length} payloads`,
            );
          }

          processedBatches.push(batchPayloads);
        }

        this.logger.log(
          `[CONTEXT-ANALYSIS] Created ${processedBatches.length} analysis batches from ${fetchedThreads.length} threads (${processedBatches.filter((b) => b.length > 0).length} non-empty)`,
        );

        // Enqueue analysis jobs for this fetch batch immediately (don't wait for all threads)
        if (processedBatches.length === 0) {
          this.logger.warn(
            `[CONTEXT-ANALYSIS] ⚠️ No processed batches from fetched threads (${fetchedThreads.length} threads fetched). Skipping this fetch batch.`,
          );
        }

        for (const batchPayload of processedBatches) {
          if (batchPayload.length === 0) {
            this.logger.warn(
              `[CONTEXT-ANALYSIS] ⚠️ Skipping empty batch payload (0 threads)`,
            );
            continue;
          }

          const batchNum = globalBatchIndex++;
          const singletonKey = `analyze-context-batch-${analysisRecord.id}-${batchNum}`;

          this.logger.log(
            `[CONTEXT-ANALYSIS] Enqueueing analysis batch ${batchNum} (batch index: ${batchNum}, ${batchPayload.length} threads) with singleton key: ${singletonKey}`,
          );

          const jobPromise = (async () => {
            try {
              const jobId = await this.boss.send(
                "analyze-context-batch",
                {
                  userId,
                  batchIndex: batchNum,
                  batch: batchPayload, // Pass pre-processed batch payloads (no Gmail API calls needed)
                  sentPayload: batchNum === 0 ? sentPayload : [], // Only send sent emails with first batch
                  userEmail: userEmail || undefined,
                  currentContextForPrompt,
                  analysisRecordId: analysisRecord.id,
                  totalBatches: Math.ceil(
                    threadIds.length / ANALYSIS_BATCH_SIZE,
                  ), // Estimate (will be refined to actual count in stats)
                  after: twelveDaysAgo.toISOString(),
                  before: fiveDaysAgo.toISOString(),
                },
                {
                  priority: getJobPriority("analyze-context-batch", false),
                  singletonKey,
                  singletonMinutes: 60,
                },
              );

              if (jobId) {
                this.logger.log(
                  `[CONTEXT-ANALYSIS] Successfully enqueued analysis batch ${batchNum + 1} with job ID: ${jobId}`,
                );
              } else {
                this.logger.warn(
                  `[CONTEXT-ANALYSIS] WARNING: Analysis batch ${batchNum + 1} returned null job ID (may be singleton duplicate)`,
                );
              }

              // Return both job ID and batch number so we can map correctly
              return { jobId, batchNum };
            } catch (error) {
              const errorMessage = getErrorMessage(error);
              this.logger.error(
                `[CONTEXT-ANALYSIS] ERROR: Failed to enqueue analysis batch ${batchNum + 1}: ${errorMessage}`,
              );
              enqueueErrors.push({
                batchNum: batchNum + 1,
                error: errorMessage,
              });
              return { jobId: null, batchNum };
            }
          })();

          jobPromises.push(jobPromise);
        }

        allProcessedBatches.push(...processedBatches);
      }

      // Total batches is the number we actually enqueued (globalBatchIndex tracks this)
      // CRITICAL: Use globalBatchIndex only - it tracks the actual number of batches enqueued
      // Don't use allProcessedBatches.length because some batches might not have been enqueued
      const totalBatches = globalBatchIndex;

      this.logger.log(
        `[CONTEXT-ANALYSIS] Calculated totalBatches: ${totalBatches} (globalBatchIndex: ${globalBatchIndex}, allProcessedBatches with content: ${allProcessedBatches.filter((b) => b.length > 0).length}, jobPromises.length: ${jobPromises.length})`,
      );

      // Note: totalBatches in job payloads was set to expectedTotalBatches when enqueuing
      // We'll store the actual totalBatches in analysis stats for accurate progress tracking

      // CRITICAL: Ensure totalBatches is at least 1 to prevent division by zero in progress calculations
      if (totalBatches === 0) {
        this.logger.error(
          `[CONTEXT-ANALYSIS] ❌ ERROR: totalBatches is 0! No batches were enqueued. allProcessedBatches.length: ${allProcessedBatches.length}, globalBatchIndex: ${globalBatchIndex}, jobPromises.length: ${jobPromises.length}`,
        );
        // Mark analysis as failed
        analysisRecord.status = "failed";
        analysisRecord.errorMessage =
          "No batches were enqueued. Analysis cannot proceed.";
        await this.contextAnalysisRepository.save(analysisRecord);
        throw new Error(
          `Cannot proceed with analysis: totalBatches is 0. No batches were processed.`,
        );
      }

      // Wait for all jobs to be enqueued (they were enqueued progressively as batches were fetched)
      let jobResults: Array<{ jobId: string | null; batchNum: number }> = [];
      try {
        jobResults = await Promise.all(jobPromises);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        this.logger.error(
          `[CONTEXT-ANALYSIS] ERROR: Promise.all failed while enqueueing jobs: ${errorMessage}`,
        );
        writeAnalysisLog(`ERROR: Promise.all failed: ${errorMessage}`, "error");
      }

      const successfulEnqueues = jobResults.filter(
        (r) => r.jobId !== null,
      ).length;
      const failedEnqueues = jobResults.length - successfulEnqueues;

      // Log job ID storage for debugging
      this.logger.log(
        `[CONTEXT-ANALYSIS] Job enqueueing complete: ${successfulEnqueues} successful, ${failedEnqueues} failed, total batches attempted: ${totalBatches}, jobResults.length: ${jobResults.length}`,
      );

      // CRITICAL: If no jobs were successfully enqueued, we cannot proceed
      if (successfulEnqueues === 0 && totalBatches > 0) {
        this.logger.error(
          `[CONTEXT-ANALYSIS] ❌ ERROR: All ${totalBatches} batches failed to enqueue! Analysis cannot proceed.`,
        );
        analysisRecord.status = "failed";
        analysisRecord.errorMessage = `All ${totalBatches} batches failed to enqueue. Check logs for enqueue errors.`;
        await this.contextAnalysisRepository.save(analysisRecord);
        throw new Error(
          `All ${totalBatches} batches failed to enqueue. Analysis cannot proceed.`,
        );
      }

      if (successfulEnqueues < totalBatches) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] ⚠️ WARNING: Only ${successfulEnqueues}/${totalBatches} batches successfully enqueued. ${failedEnqueues} failed. Analysis may be incomplete.`,
        );
      }

      this.logger.log(
        `[CONTEXT-ANALYSIS] ✅ Progressive fetch and enqueue complete: ${successfulEnqueues}/${totalBatches} analysis batches enqueued (${failedEnqueues} failed)`,
      );
      writeAnalysisLog(
        `✅ Progressive fetch and enqueue complete: ${successfulEnqueues}/${totalBatches} analysis batches enqueued`,
        "log",
      );

      if (enqueueErrors.length > 0) {
        this.logger.error(
          `[CONTEXT-ANALYSIS] Enqueue errors: ${JSON.stringify(enqueueErrors)}`,
        );
        writeAnalysisLog(
          `Enqueue errors: ${JSON.stringify(enqueueErrors)}`,
          "error",
        );
      }

      // Wait a moment for jobs to be fully registered in the queue before checking
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify jobs are in queue
      const queuedCount = await this.boss.getQueueSize("analyze-context-batch");

      this.logger.log(
        `[CONTEXT-ANALYSIS] Queue verification: ${queuedCount} jobs currently queued for analyze-context-batch`,
      );
      writeAnalysisLog(`Queue verification: ${queuedCount} jobs queued`, "log");

      if (queuedCount < totalBatches) {
        const activeOrProcessing = totalBatches - queuedCount;
        this.logger.warn(
          `[CONTEXT-ANALYSIS] WARNING: Expected ${totalBatches} jobs in queue, but found ${queuedCount}. ${activeOrProcessing} may be active/processing or not enqueued.`,
        );
        writeAnalysisLog(
          `WARNING: Expected ${totalBatches} jobs, found ${queuedCount} queued, ${activeOrProcessing} may be active`,
          "warn",
        );
      }

      // Store totalBatches, job IDs, and batch payloads in analysis stats for progress tracking, debugging, and retry logic
      // Note: We need to rebuild the batchPayloadsForRetry map by re-iterating through the enqueueing process
      // because allProcessedBatches order may not match the batch indices used during enqueueing
      const batchJobIds: Record<number, string | null> = {};
      const batchPayloadsForRetry: Record<
        number,
        Array<{
          threadId?: string;
          from: string;
          fromName?: string;
          subject: string;
          body: string;
          receivedAt: string;
          isRead?: boolean;
          timeToReply?: number | null;
          starCount?: number;
          isArchived?: boolean;
        }>
      > = {};

      // Rebuild batch payload map by iterating through allProcessedBatches in the same order as enqueueing
      // This ensures batch indices match between jobIds and payloads
      let payloadIndex = 0;
      for (const batchArray of allProcessedBatches) {
        if (batchArray.length > 0) {
          batchPayloadsForRetry[payloadIndex] = batchArray;
          payloadIndex++;
        }
      }

      // Map job IDs to batch indices using the batchNum from job results (ensures correct alignment)
      for (const result of jobResults) {
        batchJobIds[result.batchNum] = result.jobId;
        if (result.jobId) {
          this.logger.log(
            `[CONTEXT-ANALYSIS] ✅ Batch ${result.batchNum}: job ID ${result.jobId} stored`,
          );
        } else {
          this.logger.warn(
            `[CONTEXT-ANALYSIS] ⚠️ Batch ${result.batchNum}: job ID is null (may be singleton duplicate or enqueue failed)`,
          );
        }
      }

      // Log job ID mapping for debugging
      const nonNullJobIds = Object.values(batchJobIds).filter(
        (id) => id !== null,
      ).length;
      const nullJobIds = Object.values(batchJobIds).filter(
        (id) => id === null,
      ).length;
      this.logger.log(
        `[CONTEXT-ANALYSIS] Job ID mapping summary: ${nonNullJobIds} non-null, ${nullJobIds} null, ${Object.keys(batchJobIds).length} total mapped, ${totalBatches} expected batches`,
      );

      // Warn if we're missing job IDs
      if (nonNullJobIds < totalBatches) {
        const missing = totalBatches - nonNullJobIds;
        this.logger.error(
          `[CONTEXT-ANALYSIS] ❌ ERROR: Only ${nonNullJobIds}/${totalBatches} batches have job IDs! ${missing} batches are missing job IDs.`,
        );
        const missingBatchIndices: number[] = [];
        for (let i = 0; i < totalBatches; i++) {
          if (!batchJobIds[i] || batchJobIds[i] === null) {
            missingBatchIndices.push(i);
          }
        }
        this.logger.error(
          `[CONTEXT-ANALYSIS] Missing job IDs for batches: ${missingBatchIndices.slice(0, 20).join(", ")}${missingBatchIndices.length > 20 ? ` ... (${missingBatchIndices.length - 20} more)` : ""}`,
        );
      }

      // Verify alignment: jobIds length should match batchPayloadsForRetry length
      if (
        Object.keys(batchJobIds).length !==
        Object.keys(batchPayloadsForRetry).length
      ) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] WARNING: Job IDs count (${Object.keys(batchJobIds).length}) doesn't match batch payloads count (${Object.keys(batchPayloadsForRetry).length})`,
        );
      }

      if (analysisRecord.stats) {
        analysisRecord.stats = {
          ...analysisRecord.stats,
          totalBatches,
          batchJobIds, // Store job IDs for debugging and retry logic
          batchPayloadsForRetry, // Store batch payloads so we can retry expired jobs
        };
      } else {
        // Initialize stats with required fields if it doesn't exist
        analysisRecord.stats = {
          totalThreads: 0,
          outboundEmails: 0,
          threadsNeverOpened: 0,
          threadsReadButNotReplied: 0,
          vipContactsEvaluated: 0,
          totalBatches,
          batchJobIds, // Store job IDs for debugging and retry logic
          batchPayloadsForRetry, // Store batch payloads so we can retry expired jobs
        };
      }

      // Log before saving - ensure totalBatches is set
      const jobIdsBeforeSave = Object.keys(
        (analysisRecord.stats.batchJobIds as Record<number, string | null>) ||
          {},
      ).length;
      const nonNullBeforeSave = Object.values(
        (analysisRecord.stats.batchJobIds as Record<number, string | null>) ||
          {},
      ).filter((id) => id !== null).length;
      const totalBatchesBeforeSave =
        (analysisRecord.stats.totalBatches as number) || 0;

      this.logger.log(
        `[CONTEXT-ANALYSIS] About to save analysis stats: job IDs: ${jobIdsBeforeSave} (${nonNullBeforeSave} non-null), totalBatches: ${totalBatches} (current in stats: ${totalBatchesBeforeSave})`,
      );

      // Ensure totalBatches is set correctly before saving
      if (
        !analysisRecord.stats.totalBatches ||
        (analysisRecord.stats.totalBatches as number) !== totalBatches
      ) {
        analysisRecord.stats = {
          ...analysisRecord.stats,
          totalBatches, // Force update totalBatches
        };
        this.logger.log(
          `[CONTEXT-ANALYSIS] Updated totalBatches in stats from ${totalBatchesBeforeSave} to ${totalBatches}`,
        );
      }

      await this.contextAnalysisRepository.save(analysisRecord);

      // Log immediately after save
      this.logger.log(
        `[CONTEXT-ANALYSIS] ✅ Saved analysis stats: totalBatches=${totalBatches}, job IDs: ${jobIdsBeforeSave}`,
      );

      // Verify after saving - check both job IDs and totalBatches
      const savedRecord = await this.contextAnalysisRepository.findOne({
        where: { id: analysisRecord.id },
      });
      if (savedRecord && savedRecord.stats) {
        const savedJobIds =
          (savedRecord.stats.batchJobIds as Record<number, string | null>) ||
          {};
        const savedJobIdsCount = Object.keys(savedJobIds).length;
        const savedNonNullCount = Object.values(savedJobIds).filter(
          (id) => id !== null,
        ).length;
        const savedTotalBatches =
          (savedRecord.stats.totalBatches as number) || 0;

        this.logger.log(
          `[CONTEXT-ANALYSIS] ✅ Verified save: ${savedJobIdsCount} job IDs in DB (${savedNonNullCount} non-null), totalBatches: ${savedTotalBatches} (expected: ${totalBatches})`,
        );

        if (savedTotalBatches !== totalBatches) {
          this.logger.error(
            `[CONTEXT-ANALYSIS] ❌ ERROR: totalBatches mismatch after save! Expected: ${totalBatches}, Saved: ${savedTotalBatches}. Attempting to fix...`,
          );
          // Try to fix by updating totalBatches
          savedRecord.stats = {
            ...savedRecord.stats,
            totalBatches,
          };
          await this.contextAnalysisRepository.save(savedRecord);
          this.logger.log(
            `[CONTEXT-ANALYSIS] ✅ Fixed totalBatches: updated to ${totalBatches}`,
          );
        }

        if (
          savedJobIdsCount !== jobIdsBeforeSave ||
          savedNonNullCount !== nonNullBeforeSave
        ) {
          this.logger.error(
            `[CONTEXT-ANALYSIS] ❌ ERROR: Job ID count mismatch after save! Before: ${jobIdsBeforeSave} (${nonNullBeforeSave} non-null), After: ${savedJobIdsCount} (${savedNonNullCount} non-null)`,
          );
        }
      } else {
        this.logger.error(
          `[CONTEXT-ANALYSIS] ❌ ERROR: Could not verify save - savedRecord or stats missing!`,
        );
      }

      // Queue finalization job instead of polling - this allows the main job to complete quickly
      // The finalization job will check if all batches are done and do the post-processing
      // CRITICAL: Only enqueue finalization job if we actually have successfully enqueued batches to process
      if (totalBatches > 0 && successfulEnqueues > 0) {
        await this.boss.send(
          "finalize-context-analysis",
          {
            userId,
            analysisRecordId: analysisRecord.id,
            totalBatches,
            totalThreads: threadIds.length,
            sentEmailsData: sentEmailsData.length,
            analysisStats,
            userEmail: userEmail || undefined,
          },
          {
            priority: getJobPriority("finalize-context-analysis", false),
            singletonKey: `finalize-context-analysis-${analysisRecord.id}`,
            singletonMinutes: 60,
            startAfter: new Date(Date.now() + 60000), // Start after 60 seconds to give batches time to process
          },
        );

        this.logger.log(
          `[CONTEXT-ANALYSIS] ✅ Finalization job queued (will start after 5s). Main job completing. ${successfulEnqueues}/${totalBatches} batches successfully enqueued.`,
        );
        writeAnalysisLog(
          `Finalization job queued. Main job completing. ${successfulEnqueues}/${totalBatches} batches successfully enqueued.`,
          "log",
        );
      } else {
        this.logger.error(
          `[CONTEXT-ANALYSIS] ❌ ERROR: Cannot queue finalization job - totalBatches: ${totalBatches}, successfulEnqueues: ${successfulEnqueues}, jobPromises.length: ${jobPromises.length}`,
        );
        // Mark analysis as failed
        analysisRecord.status = "failed";
        analysisRecord.errorMessage = `No batches were successfully enqueued. totalBatches: ${totalBatches}, successfulEnqueues: ${successfulEnqueues}`;
        await this.contextAnalysisRepository.save(analysisRecord);
        throw new Error(
          `Cannot proceed with analysis: totalBatches is ${totalBatches}, but only ${successfulEnqueues} batches were successfully enqueued`,
        );
      }

      // Main job completes here - post-processing will happen in finalization job
      return;
    } catch (error) {
      // Set error state so frontend can display error message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[CONTEXT-ANALYSIS] ===== FAILED for user ${userId} =====`,
      );
      writeAnalysisLog(`===== FAILED for user ${userId} =====`, "error");
      this.logger.error(`[CONTEXT-ANALYSIS] Error message: ${errorMessage}`);
      writeAnalysisLog(`Error message: ${errorMessage}`, "error");
      this.logger.error(
        `[CONTEXT-ANALYSIS] Error stack: ${errorStack || "No stack trace"}`,
      );
      writeAnalysisLog(
        `Error stack: ${errorStack || "No stack trace"}`,
        "error",
      );
      this.logger.error(
        `[CONTEXT-ANALYSIS] Error object: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`,
      );
      writeAnalysisLog(
        `Error object: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`,
        "error",
      );
      try {
        // Mark analysis as failed
        if (analysisRecord) {
          analysisRecord.status = "failed";
          // Use error classifier to generate user-friendly message
          const userFriendlyMessage = classifyContextAnalysisError(error);
          analysisRecord.errorMessage = userFriendlyMessage.substring(0, 500);
          await this.contextAnalysisRepository.save(analysisRecord);
        }

        await this.usersService.update(userId, {
          scanProgress: -1,
          scanTotal: 100,
        });
        // Clear error state after 30 seconds
        setTimeout(async () => {
          await this.usersService.update(userId, {
            scanProgress: null,
            scanTotal: null,
          });
        }, PERFORMANCE_BUDGETS.CONTEXT_ANALYSIS_TIMEOUT);
      } catch (updateError) {
        this.logger.error(
          `[Context Analysis] Failed to update error state for user ${userId}:`,
          updateError,
        );
      }
      throw error;
    }
  }

  async createOrUpdateContext(
    userId: string,
    contextKey: ContextKey,
    contextValue: string,
    source: Source,
    priority?: number,
    explanation?: string,
    sourceThreadIds?: string[],
  ): Promise<UserContext> {
    const existing = await this.contextRepository.findOne({
      where: { userId, contextKey, contextValue },
    });

    // Validate context value is not blank
    const trimmedValue = (contextValue || "").trim();
    if (!trimmedValue || trimmedValue === "") {
      this.logger.warn(
        `[CONTEXT-ANALYSIS] Skipping blank context item: key=${contextKey}, value="${contextValue}"`,
      );
      throw new Error(`Context value cannot be blank for key ${contextKey}`);
    }

    // Apply PII redaction to protect user privacy
    const redactedValue = this.piiRedactionService.redactPII(trimmedValue);

    if (existing) {
      existing.lastModified = new Date();
      existing.contextValue = redactedValue; // Update with redacted value
      if (source === Source.USER_EDITED) {
        existing.source = Source.USER_EDITED;
      }
      if (priority !== undefined) {
        existing.priority = priority;
      }
      if (explanation !== undefined) {
        existing.explanation = explanation;
      }
      // Merge source thread IDs (don't replace, add new ones)
      if (sourceThreadIds && sourceThreadIds.length > 0) {
        const existingIds = existing.sourceThreadIds || [];
        const mergedIds = [...new Set([...existingIds, ...sourceThreadIds])];
        existing.sourceThreadIds = mergedIds;
      }
      return await this.contextRepository.save(existing);
    }

    const newContext = this.contextRepository.create({
      userId,
      contextKey,
      contextValue: redactedValue, // Use PII-redacted value
      source,
      priority,
      explanation,
      sourceThreadIds: sourceThreadIds || [],
    });
    return await this.contextRepository.save(newContext);
  }

  async updateContext(
    contextId: string,
    userId: string,
    updates: Partial<UserContext>,
  ): Promise<UserContext> {
    updates.source = Source.USER_EDITED;
    await this.contextRepository.update({ contextId, userId }, updates);
    return this.contextRepository.findOne({ where: { contextId, userId } });
  }

  async deleteContext(contextId: string, userId: string): Promise<void> {
    await this.contextRepository.delete({ contextId, userId });
  }

  /**
   * Deduplicate existing autogenerated context by consolidating similar entries
   */
  private async deduplicateExistingContext(userId: string): Promise<void> {
    try {
      const existingContext = await this.contextRepository.find({
        where: { userId, source: Source.AUTOGENERATED },
        order: { lastModified: "DESC" },
      });

      if (existingContext.length <= 1) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] No duplicates to consolidate (${existingContext.length} autogenerated items)`,
        );
        return;
      }

      // Group by contextKey and deduplicate within each group
      const grouped = new Map<ContextKey, UserContext[]>();
      for (const ctx of existingContext) {
        if (!grouped.has(ctx.contextKey)) {
          grouped.set(ctx.contextKey, []);
        }
        grouped.get(ctx.contextKey)!.push(ctx);
      }

      let duplicatesRemoved = 0;
      const toDelete: string[] = [];

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [key, contexts] of grouped.entries()) {
        if (contexts.length <= 1) continue;

        // Sort by lastModified (keep newest)
        contexts.sort(
          (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
        );

        // Keep the first (newest) and check others for similarity
        const keep = contexts[0];
        for (let i = 1; i < contexts.length; i++) {
          const current = contexts[i];
          try {
            if (
              this.piiRedactionService.areContextValuesSimilar(
                keep.contextValue,
                current.contextValue,
              )
            ) {
              this.logger.log(
                `[CONTEXT-ANALYSIS] Consolidating duplicate: "${current.contextValue.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}..." (keeping newer: "${keep.contextValue.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}...")`,
              );
              toDelete.push(current.contextId);
              duplicatesRemoved++;
            }
          } catch (similarityError) {
            this.logger.warn(
              `[CONTEXT-ANALYSIS] Error checking similarity during deduplication: ${getErrorMessage(similarityError)}`,
            );
            // Continue without marking as duplicate if similarity check fails
          }
        }
      }

      if (toDelete.length > 0) {
        await this.contextRepository.delete(toDelete);
        this.logger.log(
          `[CONTEXT-ANALYSIS] Removed ${duplicatesRemoved} duplicate context items`,
        );
      } else {
        this.logger.log(
          `[CONTEXT-ANALYSIS] No duplicates found in existing context`,
        );
      }
    } catch (error) {
      this.logger.error("Error deduplicating existing context:", error);
      // Don't fail the entire analysis if deduplication fails
    }
  }

  /**
   * Extract common Q&A pairs from user's sent emails (from Gmail)
   * Analyzes what questions the user is answering in their outbound emails
   */
  // eslint-disable-next-line max-lines-per-function, max-statements
  private async extractQAndAFromSentEmails(
    userId: string,
    sentEmailsData: Array<{
      id: string;
      body: string;
      htmlBody?: string;
      subject: string;
      receivedAt: Date;
    }>,
  ): Promise<void> {
    try {
      if (sentEmailsData.length === 0) {
        this.logger.log(
          "[CONTEXT-ANALYSIS] No sent emails found for Q&A extraction",
        );
        return;
      }

      this.logger.log(
        `[CONTEXT-ANALYSIS] Analyzing ${sentEmailsData.length} sent emails for common Q&A patterns...`,
      );

      // Extract Q&A pairs using LLM - analyze what questions the user is answering
      const qaPayload = sentEmailsData.map((email) => ({
        subject: email.subject,
        body: cleanEmailContent(
          email.body,
          email.htmlBody,
          PERFORMANCE_BUDGETS.PRIORITY_EXPLANATION,
        ),
        // Longer body to see full context
        receivedAt: email.receivedAt.toISOString(),
        // Use receivedAt to match LLM service signature (sentAt renamed)
      }));

      // Call LLM to extract common Q&A from sent emails
      const qaAnalysis = await this.llmService.extractQAndA(qaPayload, userId);

      if (qaAnalysis && qaAnalysis.length > 0) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${qaAnalysis.length} common Q&A pairs`,
        );

        // Get all existing Q&A from database first for better deduplication
        const existingQAs = await this.contextRepository
          .createQueryBuilder("context")
          .where("context.userId = :userId", { userId })
          .andWhere("context.contextKey = :key", { key: ContextKey.Q_AND_A })
          .getMany();

        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${existingQAs.length} existing Q&A pairs in database for deduplication`,
        );

        // Extract existing questions and answers from database
        const existingQuestions = new Set<string>();
        const existingAnswers = new Set<string>();
        for (const existingQA of existingQAs) {
          // Parse "Q: question | A: answer" format
          const qaMatch = existingQA.contextValue.match(
            /^Q:\s*(.+?)\s*\|\s*A:\s*(.+)$/,
          );
          if (qaMatch) {
            existingQuestions.add(qaMatch[1].toLowerCase().trim());
            existingAnswers.add(qaMatch[2].toLowerCase().trim());
          }
        }

        // Deduplicate Q&A before saving
        const seenQuestions = new Set<string>();
        const seenAnswers = new Set<string>();

        for (const qa of qaAnalysis) {
          if (!qa.question || !qa.answer) continue;

          // Skip if frequency is too low (should be 3+ but double-check)
          if (qa.frequency < 3) continue;

          // Normalize question and answer for deduplication
          const normalizedQuestion = qa.question.toLowerCase().trim();
          const normalizedAnswer = qa.answer.toLowerCase().trim();

          // Check for similar questions (using word overlap) in current batch
          let isDuplicate = false;
          for (const seenQ of seenQuestions) {
            if (this.areContextValuesSimilar(normalizedQuestion, seenQ)) {
              isDuplicate = true;
              break;
            }
          }

          // Check for similar answers in current batch
          if (!isDuplicate) {
            for (const seenA of seenAnswers) {
              if (this.areContextValuesSimilar(normalizedAnswer, seenA)) {
                isDuplicate = true;
                break;
              }
            }
          }

          // Check against existing database Q&A using similarity matching
          if (!isDuplicate) {
            for (const existingQ of existingQuestions) {
              if (this.areContextValuesSimilar(normalizedQuestion, existingQ)) {
                isDuplicate = true;
                break;
              }
            }
          }

          if (!isDuplicate) {
            for (const existingA of existingAnswers) {
              if (this.areContextValuesSimilar(normalizedAnswer, existingA)) {
                isDuplicate = true;
                break;
              }
            }
          }

          if (isDuplicate) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Skipping duplicate Q&A: ${qa.question.substring(0, 50)}...`, // eslint-disable-line @typescript-eslint/no-magic-numbers
            );
            continue;
          }

          seenQuestions.add(normalizedQuestion);
          seenAnswers.add(normalizedAnswer);

          // Store Q&A as "Q: question | A: answer"
          const qaValue = `Q: ${qa.question} | A: ${qa.answer}`;
          const explanation = qa.frequency
            ? `Appeared ${qa.frequency} times in your replies`
            : undefined;

          await this.createOrUpdateContext(
            userId,
            ContextKey.Q_AND_A,
            qaValue,
            Source.AUTOGENERATED,
            undefined,
            explanation,
          );

          this.logger.log(
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers
            `[CONTEXT-ANALYSIS] Added Q&A: ${qa.question.substring(0, 50)}...`,
          );
        }
      }
    } catch (error) {
      this.logger.error("Error extracting Q&A from replies:", error);
      // Don't fail the entire analysis if Q&A extraction fails
    }
  }

  /**
   * Get an analysis record by ID
   */
  async getAnalysisRecordById(
    analysisRecordId: string,
  ): Promise<ContextAnalysis | null> {
    return await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });
  }

  /**
   * Check if all batches are complete for an analysis
   */
  async getCompletedBatchCount(analysisRecordId: string): Promise<number> {
    const analysisRecord = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });

    if (!analysisRecord || !analysisRecord.stats) {
      return 0;
    }

    const { stats } = analysisRecord;
    const batchResults = (stats.batchResults as Record<string, unknown>) || {};
    return Object.keys(batchResults).length;
  }

  /**
   * Check and sync jobs between DB and PgBoss
   * Logs the difference and re-queues missing jobs
   */
  async checkAndSyncJobs(userId: string, analysisId?: string): Promise<void> {
    // Get the active analysis
    let analysis: ContextAnalysis | null = null;

    if (analysisId) {
      analysis = await this.contextAnalysisRepository.findOne({
        where: { id: analysisId, userId },
      });
    } else {
      analysis = await this.contextAnalysisRepository.findOne({
        where: [
          { userId, status: "running" },
          { userId, status: "pending" },
        ],
        order: { createdAt: "DESC" },
      });
    }

    if (!analysis || !analysis.stats) {
      this.logger.debug(
        `[PROGRESS-CHECK] No active analysis found for user ${userId}`,
      );
      return;
    }

    const { stats } = analysis;
    const batchResults = (stats.batchResults as Record<string, unknown>) || {};
    const failedBatches = (stats.failedBatches as number[]) || [];
    const batchJobIds =
      (stats.batchJobIds as Record<number, string | null>) || {};
    const batchPayloadsForRetry =
      (stats.batchPayloadsForRetry as Record<
        number,
        Array<{
          threadId?: string;
          from: string;
          fromName?: string;
          subject: string;
          body: string;
          receivedAt: string;
          isRead?: boolean;
          timeToReply?: number | null;
          starCount?: number;
          isArchived?: boolean;
        }>
      >) || {};
    const totalBatches = stats.totalBatches as number;

    // If totalBatches is 0 or missing, DON'T try to infer it from completed batches
    // This was causing the bug where totalBatches=2 was being set during progressive fetching
    // The totalBatches should ONLY be set by analyzeAndLearnFromEmails after all batches are enqueued
    if (!totalBatches || totalBatches === 0) {
      const completedBatchIndices = Object.keys(batchResults).map((k) =>
        parseInt(k, 10),
      );
      this.logger.log(
        `[PROGRESS-CHECK] totalBatches is ${totalBatches || "not set"} and ${completedBatchIndices.length} batches completed. ` +
          `This is normal during progressive fetching - NOT inferring totalBatches (would corrupt stats).`,
      );
      // Don't infer or update - just exit. The main job will set totalBatches when it's done.
      return;
    }

    // Check DB state
    const completedBatchesInDb = Object.keys(batchResults).length;
    const failedBatchesInDb = failedBatches.length;
    const batchesWithJobIdsInDb = Object.keys(batchJobIds).filter(
      (k) => batchJobIds[parseInt(k, 10)] !== null,
    ).length;
    const remainingBatchesInDb =
      totalBatches - completedBatchesInDb - failedBatchesInDb;

    // Check PgBoss queue state
    let queuedJobsInPgBoss = 0;

    try {
      queuedJobsInPgBoss = await this.boss.getQueueSize(
        "analyze-context-batch",
      );
      // PgBoss getQueueSize returns the number of jobs in the queue (pending + active)
      // This is the most reliable metric we can get without querying the database directly
    } catch (error) {
      this.logger.error(
        `[PROGRESS-CHECK] Failed to get PgBoss queue size: ${getErrorMessage(error)}`,
      );
      return;
    }

    // Calculate missing jobs
    const missingJobs = Math.max(0, remainingBatchesInDb - queuedJobsInPgBoss);

    // Log the comparison
    console.log(
      `\n[PROGRESS-CHECK] =========================================\n` +
        `Analysis: ${analysis.id} (User: ${userId})\n` +
        `\n📊 DB State:\n` +
        `  • Total batches: ${totalBatches}\n` +
        `  • Completed in DB: ${completedBatchesInDb}\n` +
        `  • Failed in DB: ${failedBatchesInDb}\n` +
        `  • Remaining in DB: ${remainingBatchesInDb}\n` +
        `  • Batches with job IDs: ${batchesWithJobIdsInDb}\n` +
        `\n📦 PgBoss State:\n` +
        `  • Queued jobs (pending + active): ${queuedJobsInPgBoss}\n` +
        `\n🔍 Difference:\n` +
        `  • Expected remaining: ${remainingBatchesInDb}\n` +
        `  • Actually queued: ${queuedJobsInPgBoss}\n` +
        `  • Missing jobs: ${missingJobs}\n` +
        `=========================================\n`,
    );

    // Also log using logger for file logging
    this.logger.log(
      `[PROGRESS-CHECK] Analysis ${analysis.id} (user ${userId}): ` +
        `DB: ${completedBatchesInDb}/${totalBatches} completed, ` +
        `${failedBatchesInDb} failed, ${remainingBatchesInDb} remaining | ` +
        `PgBoss: ${queuedJobsInPgBoss} queued | ` +
        `Missing: ${missingJobs}`,
    );

    // Find missing batches that need to be re-queued
    const completedBatchIndices = Object.keys(batchResults).map((k) =>
      parseInt(k, 10),
    );
    const missingBatchIndices: number[] = [];

    for (let i = 0; i < totalBatches; i++) {
      if (!completedBatchIndices.includes(i) && !failedBatches.includes(i)) {
        missingBatchIndices.push(i);
      }
    }

    if (missingBatchIndices.length > 0) {
      this.logger.warn(
        `[PROGRESS-CHECK] Found ${missingBatchIndices.length} missing batches: ${missingBatchIndices.slice(0, 10).join(", ")}${missingBatchIndices.length > 10 ? ` ... (${missingBatchIndices.length - 10} more)` : ""}`,
      );

      // Attempt to re-queue missing batches
      let requeuedCount = 0;
      let requeueFailedCount = 0;

      for (const batchIndex of missingBatchIndices) {
        // Check if this batch already has a job ID
        const existingJobId = batchJobIds[batchIndex];
        if (existingJobId) {
          // Batch has a job ID - check if the job actually exists in PgBoss
          // If it doesn't exist (expired or deleted), we need to re-queue
          try {
            const jobDetails = await this.boss.getJobById(existingJobId);
            if (
              jobDetails &&
              (jobDetails.state === "created" ||
                jobDetails.state === "active" ||
                jobDetails.state === "retry")
            ) {
              // Job exists and is pending/active - skip re-queue
              this.logger.debug(
                `[PROGRESS-CHECK] Batch ${batchIndex} has job ID ${existingJobId} with state '${jobDetails.state}' - still processing, skipping re-queue`,
              );
              continue;
            } else {
              // Job doesn't exist or is in a terminal state (completed/failed/cancelled/expired)
              this.logger.warn(
                `[PROGRESS-CHECK] ⚠️ Batch ${batchIndex} has job ID ${existingJobId} but job is ${jobDetails ? `in state '${jobDetails.state}'` : "not found in PgBoss"} - will re-queue`,
              );
              // Fall through to re-queue logic
            }
          } catch (error) {
            this.logger.warn(
              `[PROGRESS-CHECK] ⚠️ Failed to check job ${existingJobId} for batch ${batchIndex}: ${getErrorMessage(error)} - will attempt re-queue`,
            );
            // Fall through to re-queue logic
          }
        }

        const batchPayload = batchPayloadsForRetry[batchIndex];

        if (batchPayload && batchPayload.length > 0) {
          try {
            const user = await this.usersService.findOne(userId);
            const userEmail = user?.email;
            const existingContext = await this.getUserContext(userId);
            const currentContextForPrompt = existingContext.map((ctx) => ({
              key: ctx.contextKey,
              value: ctx.contextValue,
              source: ctx.source,
            }));

            // Use a UNIQUE singleton key for retries - include timestamp to avoid blocking by completed jobs
            // PgBoss blocks new jobs with the same singletonKey within singletonMinutes, even if "completed"
            const retryTimestamp = Date.now();
            const singletonKey = `analyze-context-batch-${analysis.id}-${batchIndex}-retry-${retryTimestamp}`;

            const retryJobId = await this.boss.send(
              "analyze-context-batch",
              {
                userId,
                batchIndex,
                batch: batchPayload,
                sentPayload: [], // Don't resend sent payload on retry
                userEmail: userEmail || undefined,
                currentContextForPrompt,
                isRetry: true, // Mark this as a retry for logging
                analysisRecordId: analysis.id,
                totalBatches,
              },
              {
                priority: getJobPriority("analyze-context-batch", false),
                singletonKey,
                singletonMinutes: 60,
              },
            );

            // CRITICAL: boss.send() returns null if a job with the same singletonKey already exists
            // This means the job is already queued or was just completed - this is expected behavior
            // Don't treat as error, just log and skip
            if (retryJobId === null) {
              this.logger.debug(
                `[PROGRESS-CHECK] Batch ${batchIndex} re-queue returned null - job with singletonKey '${singletonKey}' already exists (likely still processing). Skipping.`,
              );
              // Don't count as success or failure - job is already queued/processing
              continue;
            }

            // Update job ID in stats
            if (analysis.stats) {
              const updatedStats = { ...analysis.stats };
              const updatedBatchJobIds = {
                ...((updatedStats.batchJobIds as Record<
                  number,
                  string | null
                >) || {}),
              };
              updatedBatchJobIds[batchIndex] = retryJobId;
              updatedStats.batchJobIds = updatedBatchJobIds;
              analysis.stats = updatedStats;
              await this.contextAnalysisRepository.save(analysis);
            }

            requeuedCount++;
            this.logger.log(
              `[PROGRESS-CHECK] ✅ Re-queued batch ${batchIndex} with new job ID: ${retryJobId} (singletonKey: ${singletonKey})`,
            );
          } catch (error) {
            requeueFailedCount++;
            this.logger.error(
              `[PROGRESS-CHECK] ❌ Failed to re-queue batch ${batchIndex}: ${getErrorMessage(error)}`,
            );
          }
        } else {
          requeueFailedCount++;
          this.logger.warn(
            `[PROGRESS-CHECK] ⚠️ Cannot re-queue batch ${batchIndex}: batch payload not found in stats`,
          );
        }
      }

      if (requeuedCount > 0 || requeueFailedCount > 0) {
        this.logger.log(
          `[PROGRESS-CHECK] Re-queue summary: ${requeuedCount} successful, ${requeueFailedCount} failed`,
        );
      }
    } else {
      this.logger.log(
        `[PROGRESS-CHECK] ✅ All batches accounted for - no missing jobs detected`,
      );
    }
  }

  async checkBatchesComplete(
    analysisRecordId: string,
    totalBatches: number,
  ): Promise<boolean> {
    const analysisRecord = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });

    if (!analysisRecord || !analysisRecord.stats) {
      writeAnalysisLog(
        `[BATCH-CHECK] Analysis record ${analysisRecordId} not found or has no stats`,
        "warn",
      );
      return false;
    }

    const { stats } = analysisRecord;
    const batchResults = (stats.batchResults as Record<string, unknown>) || {};
    const failedBatches = (stats.failedBatches as number[]) || [];
    const batchJobIds =
      (stats.batchJobIds as Record<number, string | null>) || {};

    // CRITICAL: If totalBatches is 0, batches haven't been enqueued yet - not complete
    if (totalBatches === 0 || !totalBatches) {
      this.logger.warn(
        `[BATCH-CHECK] totalBatches is ${totalBatches} - batches haven't been enqueued yet. Cannot be complete.`,
      );
      writeAnalysisLog(
        `[BATCH-CHECK] totalBatches is ${totalBatches} - batches not enqueued yet`,
        "warn",
      );
      return false; // Cannot be complete if no batches were enqueued
    }

    // Check if all batches are complete (either succeeded or failed)
    const completedBatches = Object.keys(batchResults).length;
    const totalExpectedBatches = totalBatches;

    // CRITICAL: If no batches have completed and totalBatches > 0, we're definitely not complete
    if (completedBatches === 0 && totalExpectedBatches > 0) {
      this.logger.log(
        `[BATCH-CHECK] No batches completed yet (0/${totalExpectedBatches}). Analysis is NOT complete.`,
      );
      writeAnalysisLog(
        `[BATCH-CHECK] No batches completed yet (0/${totalExpectedBatches}). Analysis is NOT complete.`,
        "log",
      );
      return false;
    }

    this.logger.log(
      `[BATCH-CHECK] Checking completion: ${completedBatches}/${totalExpectedBatches} batches complete, ${failedBatches.length} failed`,
    );
    writeAnalysisLog(
      `[BATCH-CHECK] Checking completion: ${completedBatches}/${totalExpectedBatches} batches complete, ${failedBatches.length} failed`,
      "log",
    );

    // Log which batches are missing
    const completedBatchIndices = Object.keys(batchResults)
      .map((k) => parseInt(k, 10))
      .sort((a, b) => a - b);
    const missingBatchIndices: number[] = [];
    for (let i = 0; i < totalExpectedBatches; i++) {
      if (!completedBatchIndices.includes(i) && !failedBatches.includes(i)) {
        missingBatchIndices.push(i);
      }
    }

    if (missingBatchIndices.length > 0) {
      this.logger.warn(
        `[BATCH-CHECK] ⚠️ Missing batches: ${missingBatchIndices.slice(0, 20).join(", ")}${missingBatchIndices.length > 20 ? ` ... (${missingBatchIndices.length - 20} more)` : ""} (out of ${totalExpectedBatches} total). Completed: ${completedBatchIndices.slice(0, 10).join(", ") || "none"}${completedBatchIndices.length > 10 ? "..." : ""}. Failed: ${failedBatches.slice(0, 10).join(", ") || "none"}${failedBatches.length > 10 ? "..." : ""}`,
      );
      writeAnalysisLog(
        `[BATCH-CHECK] ⚠️ Missing batches: ${missingBatchIndices.length} missing (indices: ${missingBatchIndices.slice(0, 20).join(", ")})`,
        "warn",
      );

      // Categorize missing batches: never enqueued vs expired
      const neverEnqueued: number[] = [];
      const hasJobIdButExpired: number[] = [];

      for (const batchIndex of missingBatchIndices) {
        if (
          batchJobIds[batchIndex] === null ||
          batchJobIds[batchIndex] === undefined
        ) {
          neverEnqueued.push(batchIndex);
        } else {
          hasJobIdButExpired.push(batchIndex);
        }
      }

      if (neverEnqueued.length > 0) {
        this.logger.error(
          `[BATCH-CHECK] ❌ Batches that were NEVER ENQUEUED: ${neverEnqueued.join(", ")}. These cannot be retried without batch payloads.`,
        );
        writeAnalysisLog(
          `[BATCH-CHECK] ❌ Batches never enqueued: ${neverEnqueued.join(", ")}`,
          "error",
        );
      }

      if (hasJobIdButExpired.length > 0) {
        this.logger.warn(
          `[BATCH-CHECK] ⚠️ Batches with job IDs but no results (likely expired): ${hasJobIdButExpired.join(", ")}. Will attempt retry.`,
        );
        writeAnalysisLog(
          `[BATCH-CHECK] ⚠️ Batches likely expired: ${hasJobIdButExpired.join(", ")}`,
          "warn",
        );
      }
    }

    // Check job statuses in PgBoss for stuck/failed jobs if we have job IDs
    if (Object.keys(batchJobIds).length > 0) {
      for (const [batchIndexStr, jobId] of Object.entries(batchJobIds)) {
        if (!jobId) continue; // Skip null job IDs

        const batchIndex = parseInt(batchIndexStr, 10);
        // Check if this batch has a result
        const hasResult = batchResults[String(batchIndex)] !== undefined;

        if (!hasResult) {
          // Batch doesn't have a result yet - check job status in PgBoss
          try {
            // PgBoss stores jobs in database - try to get job info
            // Note: pg-boss doesn't expose getJobById directly, but we can check queue status
            // For now, we'll use a timeout heuristic: if job was created > 15 minutes ago and no result, it's likely expired
            const jobCreatedTime = analysisRecord.createdAt.getTime();
            const now = Date.now();
            const jobAgeMinutes = (now - jobCreatedTime) / (1000 * 60);

            if (jobAgeMinutes > 15) {
              // Job is older than 15 minutes (expireInMinutes limit) and has no result

              // Attempt to retry the expired job if we have the batch payload stored
              const batchPayloadsForRetry =
                (stats.batchPayloadsForRetry as Record<
                  number,
                  Array<{
                    threadId?: string;
                    from: string;
                    fromName?: string;
                    subject: string;
                    body: string;
                    receivedAt: string;
                    isRead?: boolean;
                    timeToReply?: number | null;
                    starCount?: number;
                    isArchived?: boolean;
                  }>
                >) || {};

              const batchPayload = batchPayloadsForRetry[batchIndex];
              if (batchPayload && batchPayload.length > 0) {
                // Retry the expired batch job
                try {
                  const { userId } = analysisRecord;
                  const user = await this.usersService.findOne(userId);
                  const userEmail = user?.email;
                  const existingContext = await this.getUserContext(userId);
                  const currentContextForPrompt = existingContext.map(
                    (ctx) => ({
                      key: ctx.contextKey,
                      value: ctx.contextValue,
                      source: ctx.source,
                    }),
                  );

                  // Get totalBatches from stats
                  const totalBatchesForRetry =
                    (stats.totalBatches as number) || totalExpectedBatches;

                  // Use the same singleton key pattern as original jobs to allow replacement
                  // If the original job expired, this will replace it
                  const singletonKey = `analyze-context-batch-${analysisRecordId}-${batchIndex}`;

                  const retryJobId = await this.boss.send(
                    "analyze-context-batch",
                    {
                      userId,
                      batchIndex,
                      batch: batchPayload,
                      sentPayload: [], // Don't resend sent payload on retry
                      userEmail: userEmail || undefined,
                      currentContextForPrompt,
                      analysisRecordId,
                      totalBatches: totalBatchesForRetry,
                    },
                    {
                      priority: getJobPriority("analyze-context-batch", false),
                      singletonKey,
                      singletonMinutes: 60,
                    },
                  );

                  // CRITICAL: boss.send() returns null if a job with the same singletonKey already exists
                  // This can happen if the job was just re-queued by another process or is still active
                  if (retryJobId === null) {
                    this.logger.debug(
                      `[BATCH-CHECK] Retry for expired batch ${batchIndex} returned null - job with singletonKey '${singletonKey}' already exists (old job: ${jobId}). Job may have been re-queued already or is still active.`,
                    );
                    writeAnalysisLog(
                      `[BATCH-CHECK] Retry returned null for batch ${batchIndex} - job already exists`,
                      "debug",
                    );
                    // Don't update stats or count as error - job is already queued/processing
                    continue;
                  }

                  this.logger.warn(
                    `[BATCH-CHECK] ✅ Retried expired batch ${batchIndex} with new job ID: ${retryJobId} (old job: ${jobId}, singletonKey: ${singletonKey})`,
                  );
                  writeAnalysisLog(
                    `[BATCH-CHECK] ✅ Retried expired batch ${batchIndex} with new job ID: ${retryJobId}`,
                    "warn",
                  );

                  // Update the job ID in stats
                  if (analysisRecord.stats) {
                    const updatedStats = { ...analysisRecord.stats };
                    const updatedBatchJobIds = {
                      ...((updatedStats.batchJobIds as Record<
                        number,
                        string | null
                      >) || {}),
                    };
                    updatedBatchJobIds[batchIndex] = retryJobId;
                    updatedStats.batchJobIds = updatedBatchJobIds;
                    analysisRecord.stats = updatedStats;
                    await this.contextAnalysisRepository.save(analysisRecord);
                  }
                } catch (retryError) {
                  this.logger.error(
                    `[BATCH-CHECK] Failed to retry expired batch ${batchIndex}: ${getErrorMessage(retryError)}`,
                  );
                  writeAnalysisLog(
                    `[BATCH-CHECK] ❌ Failed to retry expired batch ${batchIndex}: ${getErrorMessage(retryError)}`,
                    "error",
                  );
                }
              } else {
                this.logger.error(
                  `[BATCH-CHECK] Cannot retry expired batch ${batchIndex}: batch payload not found in stats`,
                );
                writeAnalysisLog(
                  `[BATCH-CHECK] ❌ Cannot retry expired batch ${batchIndex}: batch payload not found`,
                  "error",
                );
              }
            }
          } catch (error) {
            // Error checking job status - assume it's still processing
            this.logger.warn(
              `[BATCH-CHECK] Error checking job status for ${jobId}: ${getErrorMessage(error)}`,
            );
          }
        }
      }
    }

    // Don't update progress here - progress is updated by batch processors after each batch completes
    // This prevents progress from jumping when checkBatchesComplete is called during polling

    // Final check: only return true if we actually have completed batches AND they match the expected total
    const isComplete =
      completedBatches >= totalExpectedBatches &&
      completedBatches > 0 &&
      totalExpectedBatches > 0;

    this.logger.log(
      `[BATCH-CHECK] Final result: isComplete=${isComplete} (completedBatches: ${completedBatches}, totalExpectedBatches: ${totalExpectedBatches}, failedBatches: ${failedBatches.length})`,
    );
    writeAnalysisLog(
      `[BATCH-CHECK] Final result: isComplete=${isComplete} (${completedBatches}/${totalExpectedBatches} completed, ${failedBatches.length} failed)`,
      isComplete ? "log" : "warn",
    );

    if (isComplete) {
      this.logger.log(
        `[BATCH-CHECK] ✅ All batches complete! ${completedBatches} batches completed, ${failedBatches.length} failed, ${totalExpectedBatches} total expected.`,
      );
    } else {
      this.logger.log(
        `[BATCH-CHECK] ⏳ Not all batches complete yet. ${completedBatches}/${totalExpectedBatches} completed, ${missingBatchIndices.length} missing, ${failedBatches.length} failed.`,
      );
    }

    return isComplete;
  }

  /**
   * Finalize context analysis after all batches are complete
   * This method does the post-processing: combines results, saves context, etc.
   */
  // eslint-disable-next-line max-lines-per-function, max-statements, complexity
  async finalizeContextAnalysis(
    userId: string,
    analysisRecordId: string,
    totalBatches: number,
    totalThreads: number,
    sentEmailsCount: number,
    analysisStats: {
      totalThreads: number;
      outboundEmails: number;
      threadsNeverOpened: number;
      threadsReadButNotReplied: number;
      vipContactsEvaluated: number;
    },
    trueVipContacts: Array<{
      emailKey: string;
      from: string;
      fromName?: string;
      threadCount: number;
    }> = [],
  ): Promise<void> {
    // Ensure trueVipContacts is always an array
    const vipContacts = trueVipContacts || [];
    this.logger.log(
      `[CONTEXT-ANALYSIS] Starting finalization for analysis ${analysisRecordId}`,
    );
    writeAnalysisLog(
      `Starting finalization for analysis ${analysisRecordId}`,
      "log",
    );

    // Reload analysis record to get all batch results
    const analysisRecord = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });

    if (!analysisRecord || !analysisRecord.stats) {
      throw new Error(`Analysis record ${analysisRecordId} or stats not found`);
    }

    const finalStats = analysisRecord.stats;
    const finalBatchResults =
      (finalStats.batchResults as Record<
        string,
        {
          context?: Array<{ key: string; value: string; source: string }>;
          writingStyle?: {
            tone: string;
            style: string;
            commonPhrases: string[];
            emailExamples?: string[];
          } | null;
          threadIds?: string[]; // Thread IDs for source linking
          error?: string;
          completedAt?: string;
          failedAt?: string;
        }
      >) || {};

    // Compute VIP contacts from batch payloads (starred emails or quick replies)
    const batchPayloads =
      (finalStats.batchPayloadsForRetry as Record<
        number,
        Array<{
          threadId?: string;
          from: string;
          fromName?: string;
          subject: string;
          body: string;
          receivedAt: string;
          isRead?: boolean;
          timeToReply?: number | null;
          starCount?: number;
          isArchived?: boolean;
        }>
      >) || {};

    const vipContactsFromPayloads = new Map<
      string,
      {
        emailKey: string;
        from: string;
        fromName?: string;
        threadCount: number;
        starCount: number;
        quickReplyCount: number;
      }
    >();

    for (const batchPayload of Object.values(batchPayloads)) {
      for (const thread of batchPayload) {
        const emailKey = thread.from.toLowerCase();

        // A contact is VIP if they have starred emails OR quick replies (< 1 hour = 3600000ms)
        const isStarred = thread.starCount && thread.starCount > 0;
        const isQuickReply =
          thread.timeToReply !== null &&
          thread.timeToReply !== undefined &&
          thread.timeToReply < 3600000;

        if (isStarred || isQuickReply) {
          const existing = vipContactsFromPayloads.get(emailKey);
          if (existing) {
            existing.threadCount++;
            existing.starCount += thread.starCount || 0;
            if (isQuickReply) existing.quickReplyCount++;
          } else {
            vipContactsFromPayloads.set(emailKey, {
              emailKey,
              from: thread.from,
              fromName: thread.fromName,
              threadCount: 1,
              starCount: thread.starCount || 0,
              quickReplyCount: isQuickReply ? 1 : 0,
            });
          }
        }
      }
    }

    // Convert to the expected format and filter to only include contacts with multiple signals or high star count
    const computedVipContacts: Array<{
      emailKey: string;
      from: string;
      fromName?: string;
      threadCount: number;
    }> = Array.from(vipContactsFromPayloads.values())
      .filter(
        (v) => v.starCount >= 3 || v.quickReplyCount >= 2 || v.threadCount >= 3,
      )
      .map((v) => ({
        emailKey: v.emailKey,
        from: v.from,
        fromName: v.fromName,
        threadCount: v.threadCount,
      }));

    // Use computed VIP contacts if the passed array is empty
    const effectiveVipContacts =
      vipContacts.length > 0 ? vipContacts : computedVipContacts;

    this.logger.log(
      `[CONTEXT-ANALYSIS] VIP contacts: ${vipContacts.length} passed, ${computedVipContacts.length} computed from payloads, using ${effectiveVipContacts.length}`,
    );
    writeAnalysisLog(
      `VIP contacts: ${vipContacts.length} passed, ${computedVipContacts.length} computed from payloads, using ${effectiveVipContacts.length}`,
      "log",
    );

    // Combine results from all batches
    const allContextItems: Array<{
      key: string;
      value: string;
      source?: string;
      sourceThreadIds?: string[];
    }> = [];
    let combinedWritingStyle: {
      tone: string;
      style: string;
      commonPhrases: string[];
      emailExamples?: string[];
    } | null = null;

    // Process batches in order
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const batchResult = finalBatchResults[String(batchNum)];
      if (!batchResult) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] Batch ${batchNum} result not found in stats`,
        );
        continue;
      }

      if (batchResult.error) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] Batch ${batchNum} failed: ${batchResult.error}`,
        );
        continue;
      }

      // Combine context items (with thread IDs for source linking)
      if (batchResult.context) {
        const batchThreadIds = (batchResult.threadIds as string[]) || [];
        // Add thread IDs to each context item from this batch
        const contextWithThreads = batchResult.context.map(
          (item: { key: string; value: string; source?: string }) => ({
            ...item,
            sourceThreadIds: batchThreadIds,
          }),
        );
        allContextItems.push(...contextWithThreads);
      }

      // Combine writing style (use first batch's writing style, or merge if needed)
      if (batchResult.writingStyle && !combinedWritingStyle) {
        combinedWritingStyle = batchResult.writingStyle;
      } else if (batchResult.writingStyle && combinedWritingStyle) {
        // Merge common phrases
        combinedWritingStyle.commonPhrases = [
          ...combinedWritingStyle.commonPhrases,
          ...batchResult.writingStyle.commonPhrases,
        ];
        // Merge email examples
        if (
          batchResult.writingStyle.emailExamples &&
          batchResult.writingStyle.emailExamples.length > 0
        ) {
          combinedWritingStyle.emailExamples = [
            ...(combinedWritingStyle.emailExamples || []),
            ...batchResult.writingStyle.emailExamples,
          ].slice(0, 3); // Limit to 3 examples total
        }
      }
    }

    const analysis = {
      context: allContextItems,
      writingStyle: combinedWritingStyle || {
        tone: "Professional",
        style: "Concise",
        commonPhrases: [],
      },
    };

    this.logger.log(`[CONTEXT-ANALYSIS] ===== LLM SERVICE RETURNED =====`);
    writeAnalysisLog(`===== LLM SERVICE RETURNED =====`, "log");
    this.logger.log(
      `[CONTEXT-ANALYSIS] LLM returned ${analysis.context?.length || 0} context items`,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Writing style: tone="${analysis.writingStyle?.tone || "none"}", style="${analysis.writingStyle?.style || "none"}", commonPhrases=${analysis.writingStyle?.commonPhrases?.length || 0}, emailExamples=${(analysis.writingStyle as { emailExamples?: string[] })?.emailExamples?.length || 0}`,
    );
    writeAnalysisLog(
      `Writing style: tone="${analysis.writingStyle?.tone || "none"}", style="${analysis.writingStyle?.style || "none"}", commonPhrases=${analysis.writingStyle?.commonPhrases?.length || 0}, emailExamples=${(analysis.writingStyle as { emailExamples?: string[] })?.emailExamples?.length || 0}`,
      "log",
    );

    await this.usersService.update(userId, {
      scanProgress: 70,
      scanTotal: 100,
    });
    this.logger.log(`[CONTEXT-ANALYSIS] Processing analysis results...`);
    writeAnalysisLog(
      `[FINALIZATION] Step 1/6: Starting to process analysis results...`,
      "log",
    );

    // Step 2: Deduplicate within LLM output itself before processing
    if (analysis.context) {
      writeAnalysisLog(
        `[FINALIZATION] Step 2/6: Deduplicating ${analysis.context.length} context items from LLM output...`,
        "log",
      );
      const deduplicatedContext: Array<{
        key: string;
        value: string;
        source?: string;
        sourceThreadIds?: string[];
      }> = [];

      for (const item of analysis.context) {
        if (!item || !item.key || !item.value) continue;

        const valueStr = String(item.value || "").trim();
        const keyStr = String(item.key || "").toUpperCase();

        // Filter out insulting/repetitive statements
        const lowerValue = valueStr.toLowerCase();
        if (
          lowerValue.includes("does not reply to any emails") ||
          lowerValue.includes("doesn't reply to any") ||
          lowerValue.includes("never replies") ||
          lowerValue.includes("no emails show evidence of reply") ||
          lowerValue.includes("deprioritize direct email replies overall") ||
          lowerValue.includes("strong preference for asynchronous, non-email")
        ) {
          this.logger.log(
            `[CONTEXT-ANALYSIS] Filtering out insulting/repetitive statement: ${valueStr.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}...`,
          );
          continue;
        }

        // Check for duplicates within the LLM output itself
        let isDuplicate = false;
        for (const existing of deduplicatedContext) {
          try {
            if (
              existing.key.toUpperCase() === keyStr &&
              this.piiRedactionService.areContextValuesSimilar(
                valueStr,
                existing.value,
              )
            ) {
              isDuplicate = true;
              break;
            }
          } catch (similarityError) {
            this.logger.warn(
              `[CONTEXT-ANALYSIS] Error checking similarity: ${getErrorMessage(similarityError)}`,
            );
          }
        }

        if (!isDuplicate) {
          deduplicatedContext.push(item);
        }
      }

      const originalCount = analysis.context.length;
      analysis.context = deduplicatedContext;
      this.logger.log(
        `[CONTEXT-ANALYSIS] Deduplicated LLM output: ${deduplicatedContext.length} unique items (from ${originalCount} original)`,
      );
      writeAnalysisLog(
        `[FINALIZATION] ✅ Step 2/6: Deduplicated to ${deduplicatedContext.length} unique items`,
        "log",
      );
    }

    // Step 2.5: Consolidate EMAIL_CATEGORY items using LLM to handle semantic duplicates
    if (analysis.context) {
      const emailCategories = analysis.context.filter(
        (item) => item.key.toUpperCase() === ContextKey.EMAIL_CATEGORY,
      );

      if (emailCategories.length > 0) {
        writeAnalysisLog(
          `[FINALIZATION] Step 2.5/6: Consolidating ${emailCategories.length} email categories using LLM...`,
          "log",
        );
        this.logger.log(
          `[CONTEXT-ANALYSIS] Consolidating ${emailCategories.length} email categories using LLM...`,
        );

        const autoGeneratedCategories = emailCategories.map((item) => {
          const parts = item.value.split(" - ");
          return {
            name: parts[0].trim(),
            description:
              parts.length > 1 ? parts.slice(1).join(" - ").trim() : "",
          };
        });

        const existingUserCategories = await this.contextRepository.find({
          where: {
            userId,
            contextKey: ContextKey.EMAIL_CATEGORY,
            source: Source.USER_EDITED,
          },
        });

        const userAddedCategories = existingUserCategories.map((ctx) => {
          const parts = ctx.contextValue.split(" - ");
          return {
            name: parts[0].trim(),
            description:
              parts.length > 1 ? parts.slice(1).join(" - ").trim() : "",
          };
        });

        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${userAddedCategories.length} user-added categories to preserve`,
        );

        try {
          const consolidatedCategories =
            await this.llmService.consolidateEmailCategories(
              autoGeneratedCategories,
              userAddedCategories,
              undefined,
              userId,
            );

          const nonCategoryItems = analysis.context.filter(
            (item) => item.key.toUpperCase() !== ContextKey.EMAIL_CATEGORY,
          );

          const consolidatedCategoryItems = consolidatedCategories
            .filter((cat) => !cat.isUserAdded)
            .map((cat) => ({
              key: ContextKey.EMAIL_CATEGORY,
              value: `${cat.name} - ${cat.description}`,
              source: "email_analysis",
            }));

          analysis.context = [
            ...nonCategoryItems,
            ...consolidatedCategoryItems,
          ];

          const autoGenCount = consolidatedCategories.filter(
            (c) => !c.isUserAdded,
          ).length;
          const userCount = consolidatedCategories.filter(
            (c) => c.isUserAdded,
          ).length;

          this.logger.log(
            `[CONTEXT-ANALYSIS] Consolidated ${emailCategories.length} categories into ${autoGenCount} auto-generated (+ ${userCount} user-added preserved)`,
          );
          writeAnalysisLog(
            `[FINALIZATION] ✅ Step 2.5/6: Consolidated ${emailCategories.length} categories into ${autoGenCount} (+ ${userCount} user-added preserved)`,
            "log",
          );
        } catch (consolidationError) {
          this.logger.warn(
            `[CONTEXT-ANALYSIS] Failed to consolidate categories, keeping original: ${getErrorMessage(consolidationError)}`,
          );
          writeAnalysisLog(
            `[FINALIZATION] ⚠️ Step 2.5/6: Category consolidation failed, keeping original categories`,
            "warn",
          );
        }
      }
    }

    // Step 3: Save Context
    writeAnalysisLog(
      `[FINALIZATION] Step 3/6: Updating progress to 80%...`,
      "log",
    );
    await this.usersService.update(userId, {
      scanProgress: 80,
      scanTotal: 100,
    });

    // Step 3.1: Deduplicate existing autogenerated context
    writeAnalysisLog(
      `[FINALIZATION] Step 4/6: Deduplicating existing autogenerated context...`,
      "log",
    );
    await this.usersService.update(userId, {
      scanProgress: 81,
      scanTotal: 100,
    });
    this.logger.log(
      `[CONTEXT-ANALYSIS] Deduplicating existing autogenerated context...`,
    );
    const dedupStartTime = Date.now();
    await this.deduplicateExistingContext(userId);
    const dedupDuration = Date.now() - dedupStartTime;
    writeAnalysisLog(
      `[FINALIZATION] ✅ Step 4/6: Deduplication completed in ${Math.round(dedupDuration / 1000)}s`,
      "log",
    );

    // Save VIP contacts from starred/replied threads
    writeAnalysisLog(
      `[FINALIZATION] Step 5/6: Saving ${effectiveVipContacts.length} VIP contacts from starred/replied emails...`,
      "log",
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Saving ${effectiveVipContacts.length} VIP contacts from starred/replied emails...`,
    );
    const vipStartTime = Date.now();
    let vipCount = 0;
    let vipProcessed = 0;
    let vipSkippedDuplicates = 0;

    // Pre-fetch all existing VIP contacts for efficient duplicate checking
    const existingVipContacts = await this.contextRepository.find({
      where: { userId, contextKey: ContextKey.VIP_CONTACT },
    });
    this.logger.log(
      `[CONTEXT-ANALYSIS] Found ${existingVipContacts.length} existing VIP contacts for duplicate checking`,
    );

    // Track VIP contacts we're adding in this batch to avoid duplicates within the same run
    const addedVipContactsThisRun: string[] = [];

    for (const contact of effectiveVipContacts) {
      vipProcessed++;
      if (vipProcessed % 10 === 0) {
        writeAnalysisLog(
          `[FINALIZATION] Step 5/6: Processed ${vipProcessed}/${effectiveVipContacts.length} VIP contacts...`,
          "log",
        );
      }
      const displayName = contact.fromName || contact.from;

      // Check 1: Exact match (case-insensitive) against existing VIP contacts
      const exactMatch = existingVipContacts.find(
        (existing) =>
          existing.contextValue.toLowerCase() === displayName.toLowerCase(),
      );

      if (exactMatch) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] Skipping duplicate VIP contact (exact match): ${displayName}`,
        );
        vipSkippedDuplicates++;
        continue;
      }

      // Check 2: Similarity check against existing VIP contacts
      let isSimilarToExisting = false;
      for (const existing of existingVipContacts) {
        try {
          if (
            this.piiRedactionService.areContextValuesSimilar(
              displayName,
              existing.contextValue,
            )
          ) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Skipping duplicate VIP contact (similar to existing "${existing.contextValue}"): ${displayName}`,
            );
            isSimilarToExisting = true;
            vipSkippedDuplicates++;
            break;
          }
        } catch (similarityError) {
          this.logger.warn(
            `[CONTEXT-ANALYSIS] Error checking VIP similarity: ${getErrorMessage(similarityError)}`,
          );
        }
      }

      if (isSimilarToExisting) {
        continue;
      }

      // Check 3: Similarity check against VIP contacts added in this run
      let isSimilarToAddedThisRun = false;
      for (const addedName of addedVipContactsThisRun) {
        try {
          if (
            this.piiRedactionService.areContextValuesSimilar(
              displayName,
              addedName,
            )
          ) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Skipping duplicate VIP contact (similar to already added "${addedName}"): ${displayName}`,
            );
            isSimilarToAddedThisRun = true;
            vipSkippedDuplicates++;
            break;
          }
        } catch (similarityError) {
          this.logger.warn(
            `[CONTEXT-ANALYSIS] Error checking VIP similarity (this run): ${getErrorMessage(similarityError)}`,
          );
        }
      }

      if (isSimilarToAddedThisRun) {
        continue;
      }

      const explanation = `vipContactStarredExplanation:${contact.threadCount}`;
      await this.createOrUpdateContext(
        userId,
        ContextKey.VIP_CONTACT,
        displayName,
        Source.AUTOGENERATED,
        undefined,
        explanation,
      );
      addedVipContactsThisRun.push(displayName);
      vipCount++;
      this.logger.log(
        `[CONTEXT-ANALYSIS] Added VIP contact ${vipCount}/${effectiveVipContacts.length}: ${displayName}`,
      );
    }

    this.logger.log(
      `[CONTEXT-ANALYSIS] VIP contacts summary: ${vipCount} added, ${vipSkippedDuplicates} skipped as duplicates`,
    );
    const vipDuration = Date.now() - vipStartTime;
    writeAnalysisLog(
      `[FINALIZATION] ✅ Step 5/6: Saved ${vipCount} VIP contacts in ${Math.round(vipDuration / 1000)}s`,
      "log",
    );

    // Process LLM analysis results (but filter out VIP_CONTACT since we've already handled it)
    writeAnalysisLog(
      `[FINALIZATION] Step 6/6: Processing ${analysis.context?.length || 0} context items from LLM analysis...`,
      "log",
    );
    if (analysis.context) {
      let contextProcessed = 0;
      const contextStartTime = Date.now();
      for (const item of analysis.context) {
        contextProcessed++;
        if (contextProcessed % 20 === 0) {
          writeAnalysisLog(
            `[FINALIZATION] Step 6/6: Processed ${contextProcessed}/${analysis.context.length} context items...`,
            "log",
          );
        }
        // Validate context item - must have key and non-blank value
        if (!item || !item.key || !item.value) {
          this.logger.warn("Skipping context item with invalid data:", item);
          continue;
        }

        // Check if value is blank/whitespace only
        const trimmedValue = String(item.value || "").trim();
        if (!trimmedValue || trimmedValue === "") {
          this.logger.warn(
            `Skipping context item with blank value (key: ${item.key}):`,
            item,
          );
          continue;
        }

        let key = ContextKey.OTHER;
        let priority: number | undefined;

        const keyStr = String(item.key || "");
        const valueStr = trimmedValue; // Use already-trimmed value
        const keyUpper = keyStr.toUpperCase();
        const keyLower = keyStr.toLowerCase();
        const valueLower = valueStr.toLowerCase();

        // Skip VIP_CONTACT from LLM
        if (
          keyUpper === "VIP_CONTACT" ||
          keyUpper === "VIP" ||
          keyLower.includes("vip") ||
          keyLower.includes("important contact")
        ) {
          this.logger.log(
            `Skipping LLM VIP contact suggestion: ${valueStr} (VIP contacts are determined from starred emails)`,
          );
          continue;
        }

        // Map keys to ContextKey enum with expanded matching (synonyms, partial matches)
        // USER_INFO patterns
        if (
          keyUpper === "USER_INFO" ||
          keyUpper === "USER" ||
          keyLower.includes("role") ||
          keyLower.includes("responsibility") ||
          keyLower.includes("job") ||
          keyLower.includes("position") ||
          keyLower.includes("works as") ||
          keyLower.includes("occupation")
        ) {
          key = ContextKey.USER_INFO;
          this.logger.debug(
            `[CONTEXT-ANALYSIS] Mapped key "${keyStr}" to USER_INFO`,
          );
        }
        // WORKING_ON patterns
        else if (
          keyUpper === "CURRENT_TOPIC" ||
          keyUpper === "WORKING_ON" ||
          keyUpper === "PROJECT" ||
          keyLower.includes("team") ||
          keyLower.includes("management") ||
          keyLower.includes("coordination") ||
          keyLower.includes("work") ||
          keyLower.includes("task") ||
          keyLower.includes("project") ||
          keyLower.includes("initiative") ||
          keyLower.includes("coordinate") ||
          keyLower.includes("supervise")
        ) {
          key = ContextKey.WORKING_ON;
          if (valueLower.includes("high") || valueLower.includes("urgent")) {
            priority = 1;
          } else if (valueLower.includes("low")) {
            priority = 3;
          } else {
            priority = 2;
          }
          this.logger.debug(
            `[CONTEXT-ANALYSIS] Mapped key "${keyStr}" to WORKING_ON with priority ${priority}`,
          );
        }
        // URGENT patterns
        else if (keyUpper === "URGENT") {
          // Validate that items marked as URGENT actually describe urgent behavior
          // If the value indicates low priority, delayed, or not urgent, re-categorize as NOT_IMPORTANT
          const notUrgentIndicators = [
            "low priority",
            "not urgent",
            "delayed",
            "absent",
            "ignores",
            "archives",
            "unread",
            "does not reply",
            "doesn't reply",
            "no reply",
            "monitoring without",
            "low immediate priority",
            "lower priority",
            "non-urgent",
          ];
          const hasNotUrgentIndicator = notUrgentIndicators.some((indicator) =>
            valueLower.includes(indicator),
          );

          if (hasNotUrgentIndicator) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Re-categorizing URGENT item as NOT_IMPORTANT due to content: ${valueStr.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}...`,
            );
            key = ContextKey.NOT_IMPORTANT;
          } else {
            key = ContextKey.URGENT;
          }
        }
        // NOT_IMPORTANT patterns
        else if (
          keyUpper === "NOT_IMPORTANT" ||
          keyUpper === "NOT IMPORTANT" ||
          keyLower.includes("don't care") ||
          keyLower.includes("dont care") ||
          keyLower.includes("low priority") ||
          keyLower.includes("ignore")
        ) {
          key = ContextKey.NOT_IMPORTANT;
          this.logger.debug(
            `[CONTEXT-ANALYSIS] Mapped key "${keyStr}" to NOT_IMPORTANT`,
          );
        }
        // MY_GOALS patterns
        else if (
          keyUpper === "MY_GOALS" ||
          keyUpper === "GOALS" ||
          keyUpper === "GOAL" ||
          keyLower.includes("objective") ||
          keyLower.includes("target") ||
          keyLower.includes("aspiration")
        ) {
          key = ContextKey.MY_GOALS;
          this.logger.debug(
            `[CONTEXT-ANALYSIS] Mapped key "${keyStr}" to MY_GOALS`,
          );
        }
        // DONT_CARE patterns
        else if (
          keyUpper === "DONT_CARE" ||
          keyUpper === "DON'T_CARE" ||
          keyLower.includes("dont care") ||
          keyLower.includes("don't care")
        ) {
          key = ContextKey.DONT_CARE;
          this.logger.debug(
            `[CONTEXT-ANALYSIS] Mapped key "${keyStr}" to DONT_CARE`,
          );
        }
        // EMAIL_CATEGORY patterns
        else if (
          keyUpper === "EMAIL_CATEGORY" ||
          keyUpper === "CATEGORY" ||
          keyLower.includes("email category") ||
          keyLower.includes("email type")
        ) {
          key = ContextKey.EMAIL_CATEGORY;
          this.logger.debug(
            `[CONTEXT-ANALYSIS] Mapped key "${keyStr}" to EMAIL_CATEGORY`,
          );
        }

        // Content-based key inference if still OTHER after mapping
        if (key === ContextKey.OTHER) {
          // Infer from content if key mapping failed
          if (
            valueLower.includes("manages") ||
            valueLower.includes("coordinates") ||
            valueLower.includes("team") ||
            valueLower.includes("supervises") ||
            valueLower.includes("oversees") ||
            valueLower.includes("leads") ||
            valueLower.includes("coordination") ||
            valueLower.includes("management") ||
            valueLower.includes("project") ||
            valueLower.includes("working on") ||
            valueLower.includes("currently") ||
            valueLower.includes("initiative")
          ) {
            key = ContextKey.WORKING_ON;
            priority = 2;
            this.logger.log(
              `[CONTEXT-ANALYSIS] Content-based inference: Mapped "${keyStr}" to WORKING_ON based on content: ${valueStr.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}...`,
            );
          } else if (
            valueLower.includes("role") ||
            valueLower.includes("responsible for") ||
            valueLower.includes("works as") ||
            valueLower.includes("position") ||
            valueLower.includes("occupation") ||
            valueLower.includes("job") ||
            valueLower.includes("career")
          ) {
            key = ContextKey.USER_INFO;
            this.logger.log(
              `[CONTEXT-ANALYSIS] Content-based inference: Mapped "${keyStr}" to USER_INFO based on content: ${valueStr.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}...`,
            );
          } else if (
            valueLower.includes("goal") ||
            valueLower.includes("objective") ||
            valueLower.includes("target") ||
            valueLower.includes("aspiration") ||
            valueLower.includes("strive")
          ) {
            key = ContextKey.MY_GOALS;
            this.logger.log(
              `[CONTEXT-ANALYSIS] Content-based inference: Mapped "${keyStr}" to MY_GOALS based on content: ${valueStr.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}...`,
            );
          }
          // Keep as OTHER if no inference possible
          if (key === ContextKey.OTHER) {
            this.logger.debug(
              `[CONTEXT-ANALYSIS] No mapping found for key "${keyStr}", keeping as OTHER`,
            );
          }
        }

        // Check for existing similar context before creating
        const exactMatch = await this.contextRepository
          .createQueryBuilder("context")
          .where("context.userId = :userId", { userId })
          .andWhere("context.contextKey = :key", { key })
          .andWhere("LOWER(TRIM(context.contextValue)) = LOWER(TRIM(:value))", {
            value: valueStr,
          })
          .getOne();

        if (exactMatch) {
          this.logger.log(
            `[CONTEXT-ANALYSIS] Skipping exact duplicate context: ${key} - ${valueStr.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}...`,
          );
          continue;
        }

        // Check for similar/overlapping context across ALL context keys (cross-key deduplication)
        const existingContexts = await this.contextRepository.find({
          where: { userId },
          // Don't filter by contextKey - check all keys for duplicates
        });

        let isSimilar = false;
        let similarContextKey: ContextKey | undefined;
        for (const existing of existingContexts) {
          try {
            if (
              this.piiRedactionService.areContextValuesSimilar(
                valueStr,
                existing.contextValue,
              )
            ) {
              isSimilar = true;
              similarContextKey = existing.contextKey;
              break;
            }
          } catch (similarityError) {
            this.logger.warn(
              `[CONTEXT-ANALYSIS] Error checking similarity: ${getErrorMessage(similarityError)}`,
            );
          }
        }

        if (isSimilar && similarContextKey) {
          this.logger.log(
            `[CONTEXT-ANALYSIS] Skipping duplicate context (similar to existing ${similarContextKey}): ${valueStr.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}... (would have been ${key})`,
          );
          continue;
        }

        const explanationStr = item.source ? String(item.source) : undefined;
        await this.createOrUpdateContext(
          userId,
          key,
          valueStr,
          Source.AUTOGENERATED,
          priority,
          explanationStr,
          item.sourceThreadIds, // Pass source thread IDs for fact-checking
        );
        this.logger.log(
          `[CONTEXT-ANALYSIS] Added context: ${key} - ${valueStr.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}...`,
        );
      }

      await this.usersService.update(userId, {
        scanProgress: 85,
        scanTotal: 100,
      });
      const contextDuration = Date.now() - contextStartTime;
      writeAnalysisLog(
        `[FINALIZATION] ✅ Step 6/6: Processed ${contextProcessed} context items in ${Math.round(contextDuration / 1000)}s`,
        "log",
      );
    }

    // Save writing style to user.toneSettings.rules
    writeAnalysisLog(
      `[FINALIZATION] Saving writing style to toneSettings.rules...`,
      "log",
    );
    if (analysis.writingStyle) {
      const writingStyleRules: string[] = [];

      // Add tone if available
      if (analysis.writingStyle.tone && analysis.writingStyle.tone.trim()) {
        writingStyleRules.push(`Tone: ${analysis.writingStyle.tone}`);
      }

      // Add style if available
      if (analysis.writingStyle.style && analysis.writingStyle.style.trim()) {
        writingStyleRules.push(`Style: ${analysis.writingStyle.style}`);
      }

      // Add common phrases
      for (const phrase of analysis.writingStyle.commonPhrases || []) {
        if (phrase && phrase.trim()) {
          writingStyleRules.push(`Common phrase: "${phrase}"`);
        }
      }

      // Add email examples with name redaction (use LLM-based redaction)
      const emailExamples =
        (analysis.writingStyle as { emailExamples?: string[] }).emailExamples ||
        [];
      this.logger.log(
        `[CONTEXT-ANALYSIS] Writing style has ${emailExamples.length} email examples to process`,
      );
      writeAnalysisLog(
        `[FINALIZATION] Writing style has ${emailExamples.length} email examples to process`,
        "log",
      );
      for (const example of emailExamples) {
        if (example && example.trim()) {
          // Use LLM to redact names for better accuracy
          const redacted = await this.llmService.redactNamesWithLLM(example);
          writingStyleRules.push(`Example: ${redacted}`);
        }
      }

      if (writingStyleRules.length > 0) {
        // Merge with existing user rules (don't overwrite manual additions)
        const user = await this.usersService.findOne(userId);
        const existingRules = user?.toneSettings?.rules || [];

        // Helper to check if a rule is an email example (not Tone/Style/Common phrase)
        const isEmailExample = (rule: string) =>
          !rule.startsWith("Tone:") &&
          !rule.startsWith("Style:") &&
          !rule.startsWith("Common phrase:");

        // Count existing email examples (includes both "Example:" prefixed and legacy rules without prefix)
        const existingExampleCount = existingRules.filter((rule: string) =>
          isEmailExample(rule),
        ).length;

        // Add new rules, avoiding duplicates
        const newRules = writingStyleRules.filter(
          (rule) =>
            !existingRules.some((existing: string) => existing === rule),
        );

        // Separate new rules into examples and non-examples
        const newExamples = newRules.filter((rule) => isEmailExample(rule));
        const newNonExamples = newRules.filter((rule) => !isEmailExample(rule));

        // Limit new examples to not exceed 20 total email examples
        const maxNewExamples = Math.max(0, 20 - existingExampleCount);
        const limitedNewExamples = newExamples.slice(0, maxNewExamples);

        // Merge: existing rules + non-example rules + limited examples
        const mergedRules = [
          ...existingRules,
          ...newNonExamples,
          ...limitedNewExamples,
        ];

        await this.usersService.update(userId, {
          toneSettings: { rules: mergedRules },
        });

        this.logger.log(
          `[CONTEXT-ANALYSIS] Saved ${newRules.length} new writing style rules (total: ${mergedRules.length})`,
        );
        writeAnalysisLog(
          `[FINALIZATION] ✅ Saved ${newRules.length} new writing style rules (total: ${mergedRules.length})`,
          "log",
        );
      }
    }

    // Store statistics
    writeAnalysisLog(
      `[FINALIZATION] Saving final statistics and marking analysis as complete...`,
      "log",
    );

    // IMPORTANT: vipContactsEvaluated should be the count of VIP contacts we processed/saved
    // Use effectiveVipContacts (computed or passed) length
    const actualVipContactsEvaluated = effectiveVipContacts.length;

    // Compute thread stats and VIP contacts from batch payloads
    let threadsNeverOpened = 0;
    let threadsReadButNotReplied = 0;

    // Get batch payloads from stats to compute thread-level stats
    const batchPayloadsForStats =
      (finalStats.batchPayloadsForRetry as Record<
        number,
        Array<{
          from: string;
          fromName?: string;
          isRead?: boolean;
          isArchived?: boolean;
          timeToReply?: number | null;
          starCount?: number;
        }>
      >) || {};

    // Debug: Count total threads and sample data
    const batchKeys = Object.keys(batchPayloadsForStats);
    let totalThreadsInPayloads = 0;
    let sampleThread: unknown = null;
    let isReadTrueCount = 0;
    let isReadFalseCount = 0;
    let isReadUndefinedCount = 0;
    let hasStarCount = 0;
    let hasTimeToReplyCount = 0;

    for (const batchPayload of Object.values(batchPayloadsForStats)) {
      totalThreadsInPayloads += batchPayload.length;
      if (!sampleThread && batchPayload.length > 0) {
        sampleThread = batchPayload[0];
      }
      for (const thread of batchPayload) {
        // Count isRead values for debugging
        if (thread.isRead === true) isReadTrueCount++;
        else if (thread.isRead === false) isReadFalseCount++;
        else isReadUndefinedCount++;

        if (thread.starCount && thread.starCount > 0) hasStarCount++;
        if (thread.timeToReply !== null && thread.timeToReply !== undefined)
          hasTimeToReplyCount++;

        if (thread.isRead === false) {
          threadsNeverOpened++;
        } else if (
          thread.isRead === true &&
          (thread.timeToReply === null || thread.timeToReply === undefined)
        ) {
          // Read but no reply time recorded = read but not replied
          threadsReadButNotReplied++;
        }
      }
    }

    this.logger.log(`[FINALIZATION] ===== BATCH PAYLOAD DEBUG =====`);
    this.logger.log(
      `[FINALIZATION] Batches: ${batchKeys.length}, Threads: ${totalThreadsInPayloads}`,
    );
    this.logger.log(
      `[FINALIZATION] isRead breakdown: TRUE=${isReadTrueCount}, FALSE=${isReadFalseCount}, UNDEFINED=${isReadUndefinedCount}`,
    );
    this.logger.log(
      `[FINALIZATION] starCount>0: ${hasStarCount}, hasTimeToReply: ${hasTimeToReplyCount}`,
    );
    if (sampleThread) {
      this.logger.log(
        `[FINALIZATION] Sample thread: ${JSON.stringify(sampleThread).substring(0, 500)}`,
      );
    } else {
      this.logger.warn(
        `[FINALIZATION] ⚠️ NO BATCH PAYLOADS! Stats keys: ${JSON.stringify(Object.keys(finalStats))}`,
      );
    }
    this.logger.log(`[FINALIZATION] ===== END DEBUG =====`);

    this.logger.log(
      `[FINALIZATION] Computed stats: neverOpened=${threadsNeverOpened}, readButNotReplied=${threadsReadButNotReplied}, vipContacts=${actualVipContactsEvaluated}`,
    );

    const analysisStatsForDb = {
      totalThreads: analysisStats.totalThreads || totalThreads,
      outboundEmails: analysisStats.outboundEmails || sentEmailsCount,
      threadsNeverOpened,
      threadsReadButNotReplied,
      // Use actual VIP contacts count from the array, not the passed-in value (which is always 0)
      vipContactsEvaluated:
        actualVipContactsEvaluated || analysisStats.vipContactsEvaluated || 0,
    };

    analysisRecord.stats = analysisStatsForDb;
    await this.contextAnalysisRepository.save(analysisRecord);

    // Mark analysis as complete
    analysisRecord.status = "completed";
    analysisRecord.progress = 100;
    analysisRecord.total = 100;
    // Update threadCount to match analyzedCount (actual threads processed)
    // Some threads might not have emails and were skipped, so analyzedCount is accurate
    const actualThreadCount = analysisRecord.analyzedCount || totalThreads;
    analysisRecord.threadCount = actualThreadCount;
    analysisRecord.analyzedCount = actualThreadCount;
    this.logger.log(
      `[FINALIZATION] Updated threadCount to ${actualThreadCount} to match analyzedCount (originally ${totalThreads})`,
    );
    writeAnalysisLog(
      `Updated threadCount to ${actualThreadCount} to match analyzedCount (originally ${totalThreads})`,
      "log",
    );
    await this.contextAnalysisRepository.save(analysisRecord);

    // Update user scan progress
    writeAnalysisLog(
      `[FINALIZATION] ✅ All steps complete! Updating progress to 100%...`,
      "log",
    );
    await this.usersService.update(userId, {
      scanProgress: 100,
      scanTotal: 100,
    });
    writeAnalysisLog(
      `[FINALIZATION] ✅✅✅ FINALIZATION COMPLETE for user ${userId}`,
      "log",
    );

    this.logger.log(
      `[Context Analysis] Completed email analysis for user ${userId}. Analyzed ${totalThreads} threads.`,
    );

    // Clear progress after a short delay
    setTimeout(async () => {
      await this.usersService.update(userId, {
        scanProgress: null,
        scanTotal: null,
      });
    }, 5000);
  }

  /**
   * Consolidate existing email categories in the database using LLM.
   * This is called manually via the "Consolidate Categories" button.
   */
  async consolidateExistingCategories(userId: string): Promise<{
    originalCount: number;
    consolidatedCount: number;
    userAddedCount: number;
    categories: Array<{
      name: string;
      description: string;
      isUserAdded: boolean;
    }>;
  }> {
    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Starting manual consolidation for user ${userId}`,
    );

    // Fetch all existing EMAIL_CATEGORY context items
    const existingCategories = await this.contextRepository.find({
      where: {
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    });

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Found ${existingCategories.length} existing categories`,
    );

    if (existingCategories.length === 0) {
      return {
        originalCount: 0,
        consolidatedCount: 0,
        userAddedCount: 0,
        categories: [],
      };
    }

    // Separate user-added and auto-generated categories
    const userAddedContexts = existingCategories.filter(
      (ctx) => ctx.source === Source.USER_EDITED,
    );
    const autoGeneratedContexts = existingCategories.filter(
      (ctx) => ctx.source !== Source.USER_EDITED,
    );

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] ${autoGeneratedContexts.length} auto-generated, ${userAddedContexts.length} user-added`,
    );

    // Parse categories into name/description format
    const autoGeneratedCategories = autoGeneratedContexts.map((ctx) => {
      const parts = ctx.contextValue.split(" - ");
      return {
        name: parts[0].trim(),
        description: parts.length > 1 ? parts.slice(1).join(" - ").trim() : "",
      };
    });

    const userAddedCategories = userAddedContexts.map((ctx) => {
      const parts = ctx.contextValue.split(" - ");
      return {
        name: parts[0].trim(),
        description: parts.length > 1 ? parts.slice(1).join(" - ").trim() : "",
      };
    });

    // Call LLM to consolidate
    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Calling LLM to consolidate ${autoGeneratedCategories.length} auto-generated categories...`,
    );

    const consolidatedCategories =
      await this.llmService.consolidateEmailCategories(
        autoGeneratedCategories,
        userAddedCategories,
        undefined,
        userId,
      );

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] LLM returned ${consolidatedCategories.length} consolidated categories`,
    );

    // Delete all existing auto-generated categories
    const autoGeneratedIds = autoGeneratedContexts.map((ctx) => ctx.contextId);
    if (autoGeneratedIds.length > 0) {
      this.logger.log(
        `[CATEGORY-CONSOLIDATION] Deleting ${autoGeneratedIds.length} old auto-generated categories`,
      );
      await this.contextRepository.delete(autoGeneratedIds);
    }

    // Save the new consolidated categories (only auto-generated ones, user-added are preserved)
    const newAutoGeneratedCategories = consolidatedCategories.filter(
      (cat) => !cat.isUserAdded,
    );

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Saving ${newAutoGeneratedCategories.length} new consolidated categories`,
    );

    for (const cat of newAutoGeneratedCategories) {
      const contextValue = `${cat.name} - ${cat.description}`;
      const newContext = this.contextRepository.create({
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
        contextValue,
        source: Source.AUTOGENERATED,
      });
      await this.contextRepository.save(newContext);
    }

    const result = {
      originalCount: existingCategories.length,
      consolidatedCount:
        newAutoGeneratedCategories.length + userAddedContexts.length,
      userAddedCount: userAddedContexts.length,
      categories: consolidatedCategories,
    };

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Consolidation complete: ${result.originalCount} -> ${result.consolidatedCount} categories (${result.userAddedCount} user-added preserved)`,
    );

    return result;
  }

  /**
   * Generate new categories from emails currently in "Other" category.
   * This analyzes the emails and suggests more specific categories that would better organize them.
   */
  async generateCategoriesFromOther(userId: string): Promise<{
    newCategoriesCount: number;
    totalCategoriesCount: number;
    newCategories: Array<{ name: string; description: string }>;
  }> {
    this.logger.log(
      `[GENERATE-CATEGORIES] Starting category generation from Other emails for user ${userId}`,
    );

    // Fetch emails in "Other" category from triage
    const otherEmails = await this.emailRepository
      .createQueryBuilder("email")
      .innerJoin("email.thread", "thread")
      .where("email.userId = :userId", { userId })
      .andWhere("thread.isArchived = :isArchived", { isArchived: false })
      .andWhere("(thread.category = :other OR thread.category IS NULL)", {
        other: "Other",
      })
      .select([
        "email.id",
        "email.from",
        "email.fromName",
        "email.subject",
        "email.body",
      ])
      .orderBy("email.receivedAt", "DESC")
      .limit(50)
      .getMany();

    this.logger.log(
      `[GENERATE-CATEGORIES] Found ${otherEmails.length} emails in "Other" category`,
    );

    if (otherEmails.length === 0) {
      return {
        newCategoriesCount: 0,
        totalCategoriesCount: 0,
        newCategories: [],
      };
    }

    // Fetch existing categories
    const existingCategoryContexts = await this.contextRepository.find({
      where: {
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    });

    const existingCategories = existingCategoryContexts.map((ctx) => {
      const parts = ctx.contextValue.split(" - ");
      return {
        name: parts[0].trim(),
        description: parts.length > 1 ? parts.slice(1).join(" - ").trim() : "",
      };
    });

    this.logger.log(
      `[GENERATE-CATEGORIES] Found ${existingCategories.length} existing categories`,
    );

    // Call LLM to generate new categories
    const newCategories = await this.llmService.generateCategoriesFromOther(
      otherEmails.map((e) => ({
        from: e.from || "",
        fromName: e.fromName,
        subject: e.subject || "",
        body: cleanEmailContent(e.body, null, 300),
      })),
      existingCategories,
      undefined,
      userId,
    );

    if (newCategories.length === 0) {
      this.logger.log(
        `[GENERATE-CATEGORIES] No new categories generated from Other emails`,
      );
      return {
        newCategoriesCount: 0,
        totalCategoriesCount: existingCategories.length,
        newCategories: [],
      };
    }

    // Save the new categories
    this.logger.log(
      `[GENERATE-CATEGORIES] Saving ${newCategories.length} new categories`,
    );

    for (const cat of newCategories) {
      const contextValue = `${cat.name} - ${cat.description}`;
      const newContext = this.contextRepository.create({
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
        contextValue,
        source: Source.AUTOGENERATED,
      });
      await this.contextRepository.save(newContext);
    }

    const result = {
      newCategoriesCount: newCategories.length,
      totalCategoriesCount: existingCategories.length + newCategories.length,
      newCategories,
    };

    this.logger.log(
      `[GENERATE-CATEGORIES] Category generation complete: ${result.newCategoriesCount} new categories added (total: ${result.totalCategoriesCount})`,
    );

    return result;
  }
}
