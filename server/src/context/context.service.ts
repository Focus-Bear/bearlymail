import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  UserContext,
  ContextKey,
  Source,
} from "../database/entities/user-context.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { google } from "googleapis";

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
  // Removed in-memory caches - now using database fields (analysisThreadCount, analysisAnalyzedCount, analysisStats)

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
  ) {}

  /**
   * Redact PII (names) from text, replacing with placeholders
   */
  private redactPII(text: string, userEmail?: string): string {
    // Common name patterns (capitalized words that might be names)
    // Replace with [Name] placeholder
    let redacted = text;
    
    // Remove email addresses (keep domain structure but redact user part)
    if (userEmail) {
      const emailRegex = new RegExp(userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      redacted = redacted.replace(emailRegex, '[Your Email]');
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
      const commonWords = ['Hi', 'Hello', 'Thanks', 'Thank', 'Best', 'Regards', 'Sincerely', 'Dear', 'Hello', 'Hey', 'The', 'This', 'That', 'There', 'These', 'Those', 'I', 'You', 'We', 'They', 'He', 'She', 'It', 'A', 'An', 'And', 'Or', 'But', 'If', 'When', 'Where', 'What', 'Who', 'How', 'Why', 'Can', 'Could', 'Should', 'Would', 'Will', 'May', 'Might', 'Must', 'Have', 'Has', 'Had', 'Do', 'Does', 'Did', 'Is', 'Are', 'Was', 'Were', 'Be', 'Been', 'Being', 'Get', 'Got', 'Giving', 'Given', 'Make', 'Made', 'Making', 'Take', 'Took', 'Taking', 'Taken', 'See', 'Saw', 'Seeing', 'Seen', 'Know', 'Knew', 'Knowing', 'Known', 'Think', 'Thought', 'Thinking', 'Say', 'Said', 'Saying', 'Tell', 'Told', 'Telling', 'Come', 'Came', 'Coming', 'Go', 'Went', 'Going', 'Gone', 'Look', 'Looked', 'Looking', 'Use', 'Used', 'Using', 'Find', 'Found', 'Finding', 'Give', 'Gave', 'Giving', 'Given', 'Work', 'Worked', 'Working', 'Call', 'Called', 'Calling', 'Try', 'Tried', 'Trying', 'Ask', 'Asked', 'Asking', 'Need', 'Needed', 'Needing', 'Want', 'Wanted', 'Wanting', 'Seem', 'Seemed', 'Seeming', 'Help', 'Helped', 'Helping', 'Show', 'Showed', 'Showing', 'Shown', 'Play', 'Played', 'Playing', 'Move', 'Moved', 'Moving', 'Live', 'Lived', 'Living', 'Believe', 'Believed', 'Believing', 'Bring', 'Brought', 'Bringing', 'Happen', 'Happened', 'Happening', 'Write', 'Wrote', 'Writing', 'Written', 'Sit', 'Sat', 'Sitting', 'Stand', 'Stood', 'Standing', 'Lose', 'Lost', 'Losing', 'Pay', 'Paid', 'Paying', 'Meet', 'Met', 'Meeting', 'Include', 'Included', 'Including', 'Continue', 'Continued', 'Continuing', 'Set', 'Setting', 'Learn', 'Learned', 'Learning', 'Change', 'Changed', 'Changing', 'Lead', 'Led', 'Leading', 'Understand', 'Understood', 'Understanding', 'Watch', 'Watched', 'Watching', 'Follow', 'Followed', 'Following', 'Stop', 'Stopped', 'Stopping', 'Create', 'Created', 'Creating', 'Speak', 'Spoke', 'Speaking', 'Spoken', 'Read', 'Reading', 'Allow', 'Allowed', 'Allowing', 'Add', 'Added', 'Adding', 'Spend', 'Spent', 'Spending', 'Grow', 'Grew', 'Growing', 'Grown', 'Open', 'Opened', 'Opening', 'Walk', 'Walked', 'Walking', 'Win', 'Won', 'Winning', 'Offer', 'Offered', 'Offering', 'Remember', 'Remembered', 'Remembering', 'Love', 'Loved', 'Loving', 'Consider', 'Considered', 'Considering', 'Appear', 'Appeared', 'Appearing', 'Buy', 'Bought', 'Buying', 'Wait', 'Waited', 'Waiting', 'Serve', 'Served', 'Serving', 'Die', 'Died', 'Dying', 'Send', 'Sent', 'Sending', 'Build', 'Built', 'Building', 'Stay', 'Stayed', 'Staying', 'Fall', 'Fell', 'Falling', 'Fallen', 'Cut', 'Cutting', 'Reach', 'Reached', 'Reaching', 'Kill', 'Killed', 'Killing', 'Raise', 'Raised', 'Raising', 'Pass', 'Passed', 'Passing', 'Sell', 'Sold', 'Selling', 'Decide', 'Decided', 'Deciding', 'Return', 'Returned', 'Returning', 'Join', 'Joined', 'Joining', 'Agree', 'Agreed', 'Agreeing', 'Support', 'Supported', 'Supporting', 'Hit', 'Hitting', 'Produce', 'Produced', 'Producing', 'Eat', 'Ate', 'Eating', 'Eaten', 'Cover', 'Covered', 'Covering', 'Catch', 'Caught', 'Catching', 'Draw', 'Drew', 'Drawing', 'Drawn', 'Choose', 'Chose', 'Choosing', 'Chosen', 'Succeed', 'Succeeded', 'Succeeding', 'Fail', 'Failed', 'Failing', 'Enjoy', 'Enjoyed', 'Enjoying', 'Prevent', 'Prevented', 'Preventing', 'Discover', 'Discovered', 'Discovering', 'Prepare', 'Prepared', 'Preparing', 'Manage', 'Managed', 'Managing', 'Involve', 'Involved', 'Involving', 'Report', 'Reported', 'Reporting', 'Deal', 'Dealt', 'Dealing', 'Face', 'Faced', 'Facing', 'Accept', 'Accepted', 'Accepting', 'Improve', 'Improved', 'Improving', 'Raise', 'Raised', 'Raising', 'Reduce', 'Reduced', 'Reducing', 'Establish', 'Established', 'Establishing', 'Receive', 'Received', 'Receiving', 'Require', 'Required', 'Requiring', 'Indicate', 'Indicated', 'Indicating', 'Remember', 'Remembered', 'Remembering', 'Forget', 'Forgot', 'Forgetting', 'Forgotten', 'Complete', 'Completed', 'Completing', 'Concern', 'Concerned', 'Concerning', 'Wonder', 'Wondered', 'Wondering', 'Notice', 'Noticed', 'Noticing', 'Depend', 'Depended', 'Depending', 'Suggest', 'Suggested', 'Suggesting', 'Realize', 'Realized', 'Realizing', 'Recognize', 'Recognized', 'Recognizing', 'Relate', 'Related', 'Relating', 'Remain', 'Remained', 'Remaining', 'Represent', 'Represented', 'Representing', 'Respond', 'Responded', 'Responding', 'Result', 'Resulted', 'Resulting', 'Return', 'Returned', 'Returning', 'Reveal', 'Revealed', 'Revealing', 'Rise', 'Rose', 'Rising', 'Risen', 'Save', 'Saved', 'Saving', 'Seek', 'Sought', 'Seeking', 'Separate', 'Separated', 'Separating', 'Serve', 'Served', 'Serving', 'Share', 'Shared', 'Sharing', 'Shoot', 'Shot', 'Shooting', 'Shut', 'Shutting', 'Sing', 'Sang', 'Singing', 'Sung', 'Sink', 'Sank', 'Sinking', 'Sunk', 'Sleep', 'Slept', 'Sleeping', 'Smile', 'Smiled', 'Smiling', 'Solve', 'Solved', 'Solving', 'Sound', 'Sounded', 'Sounding', 'Spend', 'Spent', 'Spending', 'Split', 'Splitting', 'Spread', 'Spreading', 'Spring', 'Sprang', 'Springing', 'Sprung', 'Stand', 'Stood', 'Standing', 'Start', 'Started', 'Starting', 'State', 'Stated', 'Stating', 'Stay', 'Stayed', 'Staying', 'Step', 'Stepped', 'Stepping', 'Stick', 'Stuck', 'Sticking', 'Strike', 'Struck', 'Striking', 'Struck', 'Study', 'Studied', 'Studying', 'Supply', 'Supplied', 'Supplying', 'Suppose', 'Supposed', 'Supposing', 'Survive', 'Survived', 'Surviving', 'Tackle', 'Tackled', 'Tackling', 'Take', 'Took', 'Taking', 'Taken', 'Talk', 'Talked', 'Talking', 'Taste', 'Tasted', 'Tasting', 'Teach', 'Taught', 'Teaching', 'Tell', 'Told', 'Telling', 'Tend', 'Tended', 'Tending', 'Test', 'Tested', 'Testing', 'Thank', 'Thanked', 'Thanking', 'Think', 'Thought', 'Thinking', 'Throw', 'Threw', 'Throwing', 'Thrown', 'Touch', 'Touched', 'Touching', 'Train', 'Trained', 'Training', 'Travel', 'Travelled', 'Travelling', 'Treat', 'Treated', 'Treating', 'Trust', 'Trusted', 'Trusting', 'Try', 'Tried', 'Trying', 'Turn', 'Turned', 'Turning', 'Understand', 'Understood', 'Understanding', 'Unite', 'United', 'Uniting', 'Value', 'Valued', 'Valuing', 'Visit', 'Visited', 'Visiting', 'Voice', 'Voiced', 'Voicing', 'Wait', 'Waited', 'Waiting', 'Wake', 'Woke', 'Waking', 'Woken', 'Walk', 'Walked', 'Walking', 'Want', 'Wanted', 'Wanting', 'Warn', 'Warned', 'Warning', 'Wash', 'Washed', 'Washing', 'Waste', 'Wasted', 'Wasting', 'Watch', 'Watched', 'Watching', 'Wave', 'Waved', 'Waving', 'Wear', 'Wore', 'Wearing', 'Worn', 'Weigh', 'Weighed', 'Weighing', 'Welcome', 'Welcomed', 'Welcoming', 'Win', 'Won', 'Winning', 'Wish', 'Wished', 'Wishing', 'Wonder', 'Wondered', 'Wondering', 'Work', 'Worked', 'Working', 'Worry', 'Worried', 'Worrying', 'Would', 'Write', 'Wrote', 'Writing', 'Written', 'Wrong'];
      if (!commonWords.includes(word)) {
        potentialNames.add(word);
      }
    }
    
    // Replace potential names with [Name] placeholder
    for (const name of potentialNames) {
      const nameRegex = new RegExp(`\\b${name}\\b`, 'g');
      redacted = redacted.replace(nameRegex, '[Name]');
    }
    
    return redacted;
  }

  /**
   * Check if two context values are similar/overlapping
   * Uses word overlap and key phrase matching to detect duplicates
   */
  private areContextValuesSimilar(value1: string, value2: string): boolean {
    const normalize = (str: string): string => {
      return str
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, " ") // Remove punctuation
        .replace(/\s+/g, " "); // Normalize whitespace
    };

    const v1 = normalize(value1);
    const v2 = normalize(value2);

    // Exact match after normalization
    if (v1 === v2) return true;

    // Check for significant word overlap (at least 60% of words match)
    const words1 = new Set(v1.split(" ").filter((w) => w.length > 3)); // Ignore short words
    const words2 = new Set(v2.split(" ").filter((w) => w.length > 3));

    if (words1.size === 0 || words2.size === 0) return false;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    const similarity = intersection.size / union.size;

    // If 60%+ word overlap, consider them similar
    if (similarity >= 0.6) return true;

    // Check for key phrase overlap (e.g., "PostHog", "document collaboration", "SOP review")
    // Extract key phrases (2-3 word sequences) and check for overlap
    const getKeyPhrases = (text: string): Set<string> => {
      const words = text.split(" ").filter((w) => w.length > 2); // Lower threshold to catch "SOP"
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
    const importantWords = ['posthog', 'document', 'collaboration', 'sop', 'review', 'analytics', 'integration'];
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
   * Get progress information for analysis (thread count, analyzed count, stats)
   * This allows the controller to access cache data without using 'as any'
   */
  async getAnalysisProgress(userId: string): Promise<{
    threadCount?: number;
    analyzedCount?: number;
    stats?: any;
  }> {
    // Get the most recent running or completed analysis
    const analysis = await this.contextAnalysisRepository.findOne({
      where: { userId },
      order: { createdAt: "DESC" },
    });
    
    if (!analysis) {
      return {};
    }
    
    return {
      threadCount: analysis.threadCount ?? undefined,
      analyzedCount: analysis.analyzedCount ?? undefined,
      stats: analysis.stats ?? undefined,
    };
  }

  async analyzeAndLearnFromEmails(userId: string): Promise<void> {
    const startTime = Date.now();
    this.logger.log(`[CONTEXT-ANALYSIS] ===== Starting deep email analysis for user ${userId} =====`);

    // Create or get the current analysis record (declare outside try so it's accessible in catch)
    let analysisRecord = await this.contextAnalysisRepository.findOne({
      where: { userId, status: "running" },
      order: { createdAt: "DESC" },
    });

    if (!analysisRecord) {
      // Create new analysis record
      analysisRecord = this.contextAnalysisRepository.create({
        userId,
        status: "running",
        progress: 0,
        total: 100,
      });
      analysisRecord = await this.contextAnalysisRepository.save(analysisRecord);
    }

    try {
      // Step 1: Fetch threads for analysis (0-20%)
      // Analyze threads from 5-12 days ago to get a better sense of priorities
      // This gives enough time for user to review while providing more data
      await this.usersService.update(userId, {
        scanProgress: 0,
        scanTotal: 100,
      });
      
      // Update analysis record
      analysisRecord.progress = 0;
      analysisRecord.total = 100;
      await this.contextAnalysisRepository.save(analysisRecord);

      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const twelveDaysAgo = new Date();
      twelveDaysAgo.setDate(twelveDaysAgo.getDate() - 12);

      // Get user's email to exclude from VIP contacts
      const userForEmail = await this.usersService.findOne(userId);
      const userEmail = userForEmail?.email ? userForEmail.email.toLowerCase() : null;

      // Query Gmail directly for threads from 5-12 days ago (not just DB)
      this.logger.log(
        `[CONTEXT-ANALYSIS] Querying Gmail directly for threads from 5-12 days ago`,
      );
      
      // Set up Gmail OAuth client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      );
      
      if (!userForEmail?.googleCalendarAccessToken || !userForEmail?.googleCalendarRefreshToken) {
        throw new Error("Gmail access token missing - please log in again");
      }
      
      oauth2Client.setCredentials({
        access_token: userForEmail.googleCalendarAccessToken,
        refresh_token: userForEmail.googleCalendarRefreshToken,
      });
      
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      
      // Format dates for Gmail search (YYYY/MM/DD format)
      const formatGmailDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
      };
      
      const gmailAfter = formatGmailDate(twelveDaysAgo);
      const gmailBefore = formatGmailDate(fiveDaysAgo);
      
      // Gmail search query: threads from 5-12 days ago
      const gmailQuery = `after:${gmailAfter} before:${gmailBefore}`;
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Gmail search query: "${gmailQuery}"`,
      );
      
      // Query Gmail for threads
      let allThreadIds: string[] = [];
      let nextPageToken: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 10; // Limit to 10 pages (2000 threads max)
      
      do {
        const response = await gmail.users.threads.list({
          userId: "me",
          maxResults: 200, // Gmail max is 500, but we'll use 200 per page
          q: gmailQuery,
          pageToken: nextPageToken,
        });
        
        const threads = response.data.threads || [];
        allThreadIds.push(...threads.map((t: any) => t.id));
        nextPageToken = response.data.nextPageToken;
        pageCount++;
        
        this.logger.log(
          `[CONTEXT-ANALYSIS] Gmail page ${pageCount}: found ${threads.length} threads (total so far: ${allThreadIds.length})`,
        );
        
        if (pageCount >= maxPages) {
          this.logger.log(
            `[CONTEXT-ANALYSIS] Reached max pages (${maxPages}), stopping pagination`,
          );
          break;
        }
      } while (nextPageToken && allThreadIds.length < 200);
      
      // Limit to 200 threads as requested
      allThreadIds = allThreadIds.slice(0, 200);
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Gmail returned ${allThreadIds.length} thread IDs total`,
      );
      
      // Fetch full thread details from Gmail in parallel batches
      const threadsInRange: Array<{
        id: string;
        emails: Array<{
          id: string;
          from: string;
          fromName?: string;
          subject: string;
          body: string;
          htmlBody?: string;
          receivedAt: Date;
          isRead: boolean;
          timeToReply?: number;
          labelIds?: string[];
        }>;
        updatedAt: Date;
        starCount: number;
        isArchived: boolean;
      }> = [];
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Fetching full details for ${allThreadIds.length} threads from Gmail in parallel batches...`,
      );
      
      // Fetch threads in parallel batches of 50 to speed things up (Gmail allows up to 100 concurrent requests)
      const FETCH_BATCH_SIZE = 50;
      const fetchThread = async (threadId: string) => {
        try {
          const threadResponse = await gmail.users.threads.get({
            userId: "me",
            id: threadId,
            format: "full",
          });
          
          const thread = threadResponse.data;
          const messages = thread.messages || [];
          
          if (messages.length === 0) return null;
          
          // Get thread-level info
          const lastMessage = messages[messages.length - 1];
          const labelIds = lastMessage.labelIds || [];
          const isArchived = !labelIds.includes("INBOX");
          const starCount = labelIds.includes("STARRED") ? 3 : 0;
          const updatedAt = new Date(parseInt(lastMessage.internalDate || "0"));
          
          // Parse emails from thread
          const threadEmails = messages.map((msg: any) => {
            const headers = msg.payload?.headers || [];
            const fromHeader = headers.find((h: any) => h.name === "From")?.value || "";
            const subject = headers.find((h: any) => h.name === "Subject")?.value || "(No Subject)";
            const fromMatch = fromHeader.match(/(.*)<(.+)>/) || [null, fromHeader, fromHeader];
            const fromName = fromMatch[1]?.trim() || "";
            const from = fromMatch[2] || fromHeader;
            
            // Extract body
            let body = "";
            let htmlBody = "";
            const extractBody = (part: any) => {
              if (part.body?.data) {
                const text = Buffer.from(part.body.data, "base64").toString("utf-8");
                if (part.mimeType === "text/html") {
                  htmlBody += text;
                } else if (part.mimeType === "text/plain") {
                  body += text;
                }
              }
              if (part.parts) {
                part.parts.forEach(extractBody);
              }
            };
            extractBody(msg.payload);
            
            const receivedAt = new Date(parseInt(msg.internalDate || "0"));
            const isRead = !labelIds.includes("UNREAD");
            
            return {
              id: msg.id,
              from,
              fromName: fromName || undefined,
              subject,
              body,
              htmlBody: htmlBody || undefined,
              receivedAt,
              isRead,
              labelIds: msg.labelIds || [],
            };
          });
          
          return {
            id: threadId,
            emails: threadEmails,
            updatedAt,
            starCount,
            isArchived,
          };
        } catch (error: any) {
          this.logger.warn(
            `[CONTEXT-ANALYSIS] Failed to fetch thread ${threadId}: ${error.message}`,
          );
          return null;
        }
      };
      
      // Process in parallel batches
      const totalBatchesToFetch = Math.ceil(allThreadIds.length / FETCH_BATCH_SIZE);
      for (let i = 0; i < allThreadIds.length; i += FETCH_BATCH_SIZE) {
        const batch = allThreadIds.slice(i, i + FETCH_BATCH_SIZE);
        const batchStartTime = Date.now();
        const batchNum = Math.floor(i / FETCH_BATCH_SIZE) + 1;
        
        this.logger.log(
          `[CONTEXT-ANALYSIS] Fetching batch ${batchNum}/${totalBatchesToFetch} (threads ${i + 1}-${Math.min(i + FETCH_BATCH_SIZE, allThreadIds.length)})...`,
        );
        
        // Update progress: 5-10% for fetching threads
        const fetchProgress = 5 + Math.floor((threadsInRange.length / allThreadIds.length) * 5);
        await this.usersService.update(userId, {
          scanProgress: fetchProgress,
          scanTotal: 100,
        });
        
        // Fetch all threads in this batch in parallel
        const batchResults = await Promise.all(
          batch.map(threadId => fetchThread(threadId))
        );
        
        // Filter out null results and add to threadsInRange
        const validThreads = batchResults.filter((t): t is NonNullable<typeof t> => t !== null);
        threadsInRange.push(...validThreads);
        
        const batchDuration = Date.now() - batchStartTime;
        this.logger.log(
          `[CONTEXT-ANALYSIS] Batch completed in ${batchDuration}ms (${validThreads.length}/${batch.length} threads fetched, total: ${threadsInRange.length}/${allThreadIds.length})`,
        );
      }
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Successfully fetched ${threadsInRange.length} threads from Gmail`,
      );

      const totalThreads = threadsInRange.length;
      this.logger.log(
        `[CONTEXT-ANALYSIS] Found ${totalThreads} threads from 5-12 days ago for user ${userId}`,
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

      // Store thread count in scanTotal temporarily (we'll use it for progress messages)
      // Store as negative to indicate it's a thread count, not a progress total
      // Actually, let's use a different approach - store in a metadata field or pass through message
      await this.usersService.update(userId, {
        scanProgress: 10,
        scanTotal: 100,
      });
      this.logger.log(
        `[CONTEXT-ANALYSIS] Will analyze ${totalThreads} threads (this will be shown in progress messages)`,
      );
      
      // Store thread count in analysis record
      analysisRecord.threadCount = totalThreads;
      analysisRecord.analyzedCount = 0;
      await this.contextAnalysisRepository.save(analysisRecord);

      // Already updated above with thread count

      // Build thread-based payloads for LLM analysis
      // Group emails by thread and analyze thread-level behavior
      this.logger.log(
        `[CONTEXT-ANALYSIS] Building thread payloads from ${threadsInRange.length} threads`,
      );
      
      const receivedThreadsPayload = threadsInRange
        .map((thread) => {
          // Get the first (original) email in the thread
          const firstEmail = thread.emails
            ?.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())[0];
          if (!firstEmail) {
            this.logger.warn(
              `[CONTEXT-ANALYSIS] Thread ${thread.id} has no emails, skipping`,
            );
            return null;
          }

          // Check if user replied (any email in thread is from user - has SENT label)
          const userReplied = thread.emails?.some((e) => {
            return e.labelIds?.includes("SENT") || (userEmail && e.from.toLowerCase() === userEmail);
          });
          
          // Calculate reply time if user replied
          let quickestReply: number | null = null;
          if (userReplied) {
            const sentEmails = thread.emails.filter((e) => 
              e.labelIds?.includes("SENT") || (userEmail && e.from.toLowerCase() === userEmail)
            );
            const receivedEmails = thread.emails.filter((e) => 
              !e.labelIds?.includes("SENT") && (!userEmail || e.from.toLowerCase() !== userEmail)
            );
            
            // Find time between first received email and first sent email
            if (sentEmails.length > 0 && receivedEmails.length > 0) {
              const firstReceived = receivedEmails[0].receivedAt;
              const firstSent = sentEmails[0].receivedAt;
              const replyTimeHours = (firstSent.getTime() - firstReceived.getTime()) / (1000 * 60 * 60);
              if (replyTimeHours >= 0) {
                quickestReply = replyTimeHours;
              }
            }
          }

          // Count emails in thread
          const emailCount = thread.emails?.length || 0;
          const readCount = thread.emails?.filter((e) => e.isRead).length || 0;

          return {
            threadId: thread.id, // Include thread ID
            from: firstEmail.from,
            fromName: firstEmail.fromName,
            subject: firstEmail.subject,
            body: cleanEmailContent(
              firstEmail.body,
              firstEmail.htmlBody,
              2000,
            ), // Clean email content for analysis
            receivedAt: firstEmail.receivedAt.toISOString(),
            threadUpdatedAt: thread.updatedAt.toISOString(),
            isRead: firstEmail.isRead,
            timeToReply: quickestReply ? quickestReply * 60 : null, // Convert hours to minutes
            starCount: thread.starCount || 0,
            isArchived: thread.isArchived || false,
            userReplied: userReplied,
            emailCount: emailCount,
            readCount: readCount,
            receivedHour: firstEmail.receivedAt.getHours(),
          };
        })
        .filter((t) => t !== null);
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Built ${receivedThreadsPayload.length} thread payloads (filtered out ${threadsInRange.length - receivedThreadsPayload.length} threads with no emails)`,
      );

      // Get sent emails from Gmail (emails with SENT label) for writing style analysis
      this.logger.log(
        `[CONTEXT-ANALYSIS] Querying Gmail for sent emails from 5-12 days ago`,
      );
      
      const sentGmailQuery = `after:${gmailAfter} before:${gmailBefore} in:sent`;
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Gmail sent emails query: "${sentGmailQuery}"`,
      );
      
      let allSentMessageIds: string[] = [];
      let sentNextPageToken: string | undefined = undefined;
      let sentPageCount = 0;
      
      do {
        const sentResponse = await gmail.users.messages.list({
          userId: "me",
          maxResults: 50,
          q: sentGmailQuery,
          pageToken: sentNextPageToken,
        });
        
        const messages = sentResponse.data.messages || [];
        allSentMessageIds.push(...messages.map((m: any) => m.id));
        sentNextPageToken = sentResponse.data.nextPageToken;
        sentPageCount++;
        
        this.logger.log(
          `[CONTEXT-ANALYSIS] Gmail sent emails page ${sentPageCount}: found ${messages.length} messages (total so far: ${allSentMessageIds.length})`,
        );
        
        if (sentPageCount >= 3) break; // Limit to 150 sent emails
      } while (sentNextPageToken && allSentMessageIds.length < 150);
      
      allSentMessageIds = allSentMessageIds.slice(0, 50); // Use first 50
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Gmail returned ${allSentMessageIds.length} sent message IDs`,
      );
      
      // Fetch sent email details in parallel batches
      const sentEmailsData: Array<{
        id: string;
        body: string;
        htmlBody?: string;
        subject: string;
        receivedAt: Date;
      }> = [];
      
      const fetchSentMessage = async (messageId: string) => {
        try {
          const msgResponse = await gmail.users.messages.get({
            userId: "me",
            id: messageId,
            format: "full",
          });
          
          const msg = msgResponse.data;
          const headers = msg.payload?.headers || [];
          const subject = headers.find((h: any) => h.name === "Subject")?.value || "(No Subject)";
          
          // Extract body
          let body = "";
          let htmlBody = "";
          const extractBody = (part: any) => {
            if (part.body?.data) {
              const text = Buffer.from(part.body.data, "base64").toString("utf-8");
              if (part.mimeType === "text/html") {
                htmlBody += text;
              } else if (part.mimeType === "text/plain") {
                body += text;
              }
            }
            if (part.parts) {
              part.parts.forEach(extractBody);
            }
          };
          extractBody(msg.payload);
          
          const receivedAt = new Date(parseInt(msg.internalDate || "0"));
          
          return {
            id: messageId,
            body,
            htmlBody: htmlBody || undefined,
            subject,
            receivedAt,
          };
        } catch (error: any) {
          this.logger.warn(
            `[CONTEXT-ANALYSIS] Failed to fetch sent message ${messageId}: ${error.message}`,
          );
          return null;
        }
      };
      
      // Fetch sent emails in parallel batches of 50
      const SENT_FETCH_BATCH_SIZE = 50;
      for (let i = 0; i < allSentMessageIds.length; i += SENT_FETCH_BATCH_SIZE) {
        const batch = allSentMessageIds.slice(i, i + SENT_FETCH_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(messageId => fetchSentMessage(messageId))
        );
        const validMessages = batchResults.filter((m): m is NonNullable<typeof m> => m !== null);
        sentEmailsData.push(...validMessages);
      }
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Successfully fetched ${sentEmailsData.length} sent emails from Gmail`,
      );

      const sentPayload = sentEmailsData.map((e) => ({
        emailId: e.id, // Include email ID so we can link to it
        to: "recipient@example.com",
        subject: e.subject,
        body: cleanEmailContent(e.body, e.htmlBody, 3000), // Longer body for better style analysis
        sentAt: e.receivedAt.toISOString(),
      }));

      await this.usersService.update(userId, {
        scanProgress: 15,
        scanTotal: 100,
      });

      // Step 1.5: Identify VIP contacts from threads where user replied (before LLM analysis)
      // Also collect statistics for final summary
      const analysisStats = {
        totalThreads: threadsInRange.length,
        outboundEmails: sentEmailsData.length,
        threadsNeverOpened: 0,
        threadsReadButNotReplied: 0,
        vipContactsEvaluated: 0,
      };

      // Group threads by sender (contact) and only count threads where user replied
      const vipContacts = new Map<
        string,
        {
          from: string;
          fromName?: string;
          threadCount: number;
          quickReplyCount: number;
          totalEmailsInThreads: number; // Track total emails for back-and-forth detection
        }
      >();

      for (const thread of threadsInRange) {
        // Collect statistics
        const isRead = thread.emails?.some((e) => e.isRead) || false;
        const userReplied = thread.emails?.some((e) => {
          return e.labelIds?.includes("SENT") || (userEmail && e.from.toLowerCase() === userEmail);
        });
        
        if (!isRead) {
          analysisStats.threadsNeverOpened++;
        } else if (isRead && !userReplied) {
          analysisStats.threadsReadButNotReplied++;
        }
        // Get the first email from the thread to identify the sender
        const firstEmail = thread.emails?.[0];
        if (!firstEmail) continue;

        const emailKey = firstEmail.from.toLowerCase();

        // Exclude the logged-in user's own email from VIP contacts
        if (userEmail && emailKey === userEmail) {
          continue;
        }

        // Check if user replied to this thread (has SENT label) - already checked above
        if (!userReplied) {
          continue; // Skip threads where user didn't reply
        }

        // Calculate if it was a quick reply (< 30 minutes)
        let hasQuickReply = false;
        const sentEmails = thread.emails.filter((e) => 
          e.labelIds?.includes("SENT") || (userEmail && e.from.toLowerCase() === userEmail)
        );
        const receivedEmails = thread.emails.filter((e) => 
          !e.labelIds?.includes("SENT") && (!userEmail || e.from.toLowerCase() !== userEmail)
        );
        
        if (sentEmails.length > 0 && receivedEmails.length > 0) {
          const firstReceived = receivedEmails[0].receivedAt;
          const firstSent = sentEmails[0].receivedAt;
          const replyTimeHours = (firstSent.getTime() - firstReceived.getTime()) / (1000 * 60 * 60);
          hasQuickReply = replyTimeHours >= 0 && replyTimeHours < 0.5; // < 30 minutes
        }

        const existing = vipContacts.get(emailKey);
        if (existing) {
          // Increment thread count for this contact
          existing.threadCount += 1;
          existing.totalEmailsInThreads += thread.emails?.length || 0;
          if (hasQuickReply) {
            existing.quickReplyCount += 1;
          }
          // Update fromName if we have a better one
          if (firstEmail.fromName && !existing.fromName) {
            existing.fromName = firstEmail.fromName;
          }
        } else {
          // First thread from this contact
          vipContacts.set(emailKey, {
            from: firstEmail.from,
            fromName: firstEmail.fromName,
            threadCount: 1,
            quickReplyCount: hasQuickReply ? 1 : 0,
            totalEmailsInThreads: thread.emails?.length || 0,
          });
        }
      }

      // Relaxed VIP filter: Include contacts with:
      // 1. Multiple quick replies (2+), OR
      // 2. Lots of back-and-forth (5+ threads with 3+ emails each indicating active conversation)
      const trueVipContacts = new Map<
        string,
        { from: string; fromName?: string; threadCount: number }
      >();
      for (const [emailKey, contact] of vipContacts.entries()) {
        const avgEmailsPerThread = contact.totalEmailsInThreads / contact.threadCount;
        const hasLotsOfBackAndForth = contact.threadCount >= 5 && avgEmailsPerThread >= 3;
        const hasMultipleQuickReplies = contact.quickReplyCount >= 2;
        
        if (hasMultipleQuickReplies || hasLotsOfBackAndForth) {
          trueVipContacts.set(emailKey, {
            from: contact.from,
            fromName: contact.fromName,
            threadCount: contact.threadCount,
          });
        }
      }
      
      analysisStats.vipContactsEvaluated = trueVipContacts.size; // Use the filtered VIP contacts count

      this.logger.log(
        `Found ${trueVipContacts.size} VIP contacts from ${totalThreads} threads analyzed (filtered to those with 2+ quick replies)`,
      );

      await this.usersService.update(userId, {
        scanProgress: 25,
        scanTotal: 100,
      });

      // Get current context to avoid duplicates
      const existingContext = await this.getUserContext(userId);
      const currentContextForPrompt = existingContext.map((ctx) => ({
        key: ctx.contextKey,
        value: ctx.contextValue,
        source: ctx.source,
      }));

      // Step 2: Call LLM for analysis (30-70%)
      // Ensure analysis record is initialized
      analysisRecord.threadCount = totalThreads;
      analysisRecord.analyzedCount = 0;
      await this.contextAnalysisRepository.save(analysisRecord);
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Initialized analysis progress in DB: threadCount=${totalThreads}, analyzedCount=0`,
      );
      
      await this.usersService.update(userId, {
        scanProgress: 30,
        scanTotal: 100,
      });
      
      const llmStartTime = Date.now();
      this.logger.log(
        `[CONTEXT-ANALYSIS] ===== CALLING LLM SERVICE =====`,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] Input: ${receivedThreadsPayload.length} threads, ${sentPayload.length} sent emails`,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] Thread IDs being analyzed: ${receivedThreadsPayload.slice(0, 10).map((t: any) => t?.threadId || 'N/A').join(', ')}${receivedThreadsPayload.length > 10 ? `... (${receivedThreadsPayload.length} total)` : ''}`,
      );
      // Batch threads to LLM (50 at a time to avoid overwhelming it)
      const BATCH_SIZE = 50;
      const totalBatches = Math.ceil(receivedThreadsPayload.length / BATCH_SIZE);
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Sending ${receivedThreadsPayload.length} threads to LLM in ${totalBatches} batches of ${BATCH_SIZE}`,
      );

      if (receivedThreadsPayload.length === 0) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] WARNING: No thread data to analyze. This should not happen if threads were found.`,
        );
      }

      // Process threads in batches and combine results
      let allContextItems: Array<{ key: string; value: string; source: string }> = [];
      let combinedWritingStyle: {
        tone: string;
        style: string;
        commonPhrases: string[];
        emailExamples?: string[];
      } | null = null;

      for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        const batchStart = batchNum * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, receivedThreadsPayload.length);
        const batch = receivedThreadsPayload.slice(batchStart, batchEnd);
        
        this.logger.log(
          `[CONTEXT-ANALYSIS] Processing batch ${batchNum + 1}/${totalBatches} (threads ${batchStart + 1}-${batchEnd} of ${receivedThreadsPayload.length})`,
        );
        
        // Update analyzed count in analysis record BEFORE starting batch (so progress message shows it immediately)
        analysisRecord.analyzedCount = batchStart;
        await this.contextAnalysisRepository.save(analysisRecord);
        
        // Update progress BEFORE starting batch: 30-70% for LLM analysis (distributed across batches)
        // Show "X/200 threads analyzed" in progress message
        const llmProgress = 30 + Math.floor(((batchNum + 1) / totalBatches) * 40);
        
        // Update progress in database (analyzed count already set above)
        await this.usersService.update(userId, {
          scanProgress: llmProgress,
          scanTotal: 100,
        });
        
        this.logger.log(
          `[CONTEXT-ANALYSIS] Updated progress: ${llmProgress}%, analyzedCount=${batchStart}/${totalThreads} (cache set before batch)`,
        );
        
        this.logger.log(
          `[CONTEXT-ANALYSIS] Calling llmService.analyzeEmailPatterns() for batch ${batchNum + 1} at ${new Date().toISOString()}`,
        );
        this.logger.log(
          `[CONTEXT-ANALYSIS] Progress: ${llmProgress}%, Analyzed so far: ${batchStart}/${totalThreads} threads`,
        );
        
        const batchAnalysis = await this.llmService.analyzeEmailPatterns(
          batch,
          batchNum === 0 ? sentPayload : [], // Only send sent emails with first batch
        undefined,
        userId,
        userEmail || undefined,
        currentContextForPrompt,
        );
        
        // Update analyzed count in analysis record AFTER batch completes
        analysisRecord.analyzedCount = batchEnd;
        await this.contextAnalysisRepository.save(analysisRecord);
        
        this.logger.log(
          `[CONTEXT-ANALYSIS] Batch ${batchNum + 1}/${totalBatches} completed. Analyzed ${batchEnd}/${totalThreads} threads. Progress: ${llmProgress}%`,
        );
        
        // Combine results
        if (batchAnalysis.context) {
          allContextItems.push(...batchAnalysis.context);
        }
        
        // Combine writing style (use first batch's writing style, or merge if needed)
        if (batchAnalysis.writingStyle && !combinedWritingStyle) {
          combinedWritingStyle = batchAnalysis.writingStyle;
        } else if (batchAnalysis.writingStyle && combinedWritingStyle) {
          // Merge common phrases
          combinedWritingStyle.commonPhrases = [
            ...combinedWritingStyle.commonPhrases,
            ...batchAnalysis.writingStyle.commonPhrases,
          ];
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
      const llmDuration = Date.now() - llmStartTime;

      this.logger.log(
        `[CONTEXT-ANALYSIS] ===== LLM SERVICE RETURNED =====`,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] LLM call took ${llmDuration}ms (${(llmDuration / 1000).toFixed(2)}s)`,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] LLM returned ${analysis.context?.length || 0} context items`,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] LLM returned writing style: tone="${analysis.writingStyle?.tone || 'N/A'}", style="${analysis.writingStyle?.style || 'N/A'}", ${analysis.writingStyle?.commonPhrases?.length || 0} phrases`,
      );

      await this.usersService.update(userId, {
        scanProgress: 70,
        scanTotal: 100,
      });
      this.logger.log(`[CONTEXT-ANALYSIS] Processing analysis results...`);

      this.logger.log(
        "LLM Analysis Result:",
        JSON.stringify(analysis, null, 2),
      );

      // Step 3: Deduplicate within LLM output itself before processing
      // Filter out insulting/repetitive statements and consolidate duplicates
      if (analysis.context) {
        const deduplicatedContext: Array<{
          key: string;
          value: string;
          source: string;
        }> = [];
        const seen = new Set<string>();

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
              `[CONTEXT-ANALYSIS] Filtering out insulting/repetitive statement: ${valueStr.substring(0, 50)}...`,
            );
            continue;
          }

          // Check for duplicates within the LLM output itself
          let isDuplicate = false;
          for (const existing of deduplicatedContext) {
            if (
              existing.key.toUpperCase() === keyStr &&
              this.areContextValuesSimilar(valueStr, existing.value)
            ) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Consolidating duplicate within LLM output: "${valueStr.substring(0, 50)}..." (similar to "${existing.value.substring(0, 50)}...")`,
            );
              isDuplicate = true;
              break;
            }
          }

          if (!isDuplicate) {
            deduplicatedContext.push(item);
          }
        }

        // Replace analysis.context with deduplicated version
        const originalCount = analysis.context.length;
        analysis.context = deduplicatedContext;
        this.logger.log(
          `[CONTEXT-ANALYSIS] Deduplicated LLM output: ${deduplicatedContext.length} unique items (from ${originalCount} original, removed ${originalCount - deduplicatedContext.length} duplicates)`,
        );
      }

      // Step 3: Save Context - preserve existing autogenerated context and add new insights (80-100%)
      await this.usersService.update(userId, {
        scanProgress: 80,
        scanTotal: 100,
      });

      // NOTE: We preserve existing autogenerated context instead of deleting it.
      // The LLM is instructed to only return NEW insights, and we deduplicate before adding.
      // This ensures existing context is preserved unless explicitly incorrect.

      // Step 3.1: Deduplicate existing autogenerated context
      await this.usersService.update(userId, {
        scanProgress: 81,
        scanTotal: 100,
      });
      this.logger.log(`[CONTEXT-ANALYSIS] Deduplicating existing autogenerated context...`);
      await this.deduplicateExistingContext(userId);

      // Save VIP contacts from replied threads (this takes priority over LLM analysis)
      this.logger.log(
        `[CONTEXT-ANALYSIS] Saving ${trueVipContacts.size} VIP contacts from replied emails...`,
      );
      let vipCount = 0;
      for (const [emailKey, contact] of trueVipContacts.entries()) {
        const displayName = contact.fromName || contact.from;

        // Check if similar VIP contact already exists (deduplication)
        const existingContext = await this.contextRepository.findOne({
          where: {
            userId,
            contextKey: ContextKey.VIP_CONTACT,
            // Check for similar email addresses (case-insensitive)
          },
        });

        // Check if this email or similar already exists
        const existingVip = await this.contextRepository
          .createQueryBuilder("context")
          .where("context.userId = :userId", { userId })
          .andWhere("context.contextKey = :key", {
            key: ContextKey.VIP_CONTACT,
          })
          .andWhere("LOWER(context.contextValue) = LOWER(:value)", {
            value: displayName,
          })
          .getOne();

        if (existingVip) {
          this.logger.log(
            `[CONTEXT-ANALYSIS] Skipping duplicate VIP contact: ${displayName}`,
          );
          continue; // Skip duplicates
        }

        // Store explanation as a translation key pattern that frontend can translate
        // Format: "translationKey:param1:param2" - frontend will parse and translate
        // Use threadCount to indicate number of distinct starred threads
        const explanation = `vipContactStarredExplanation:${contact.threadCount}`;
        await this.createOrUpdateContext(
          userId,
          ContextKey.VIP_CONTACT,
          displayName,
          Source.AUTOGENERATED,
          undefined,
          explanation,
        );
        vipCount++;
        this.logger.log(
          `[CONTEXT-ANALYSIS] Added VIP contact ${vipCount}/${vipContacts.size}: ${displayName} (${contact.threadCount} starred threads)`,
        );
      }

      // Process LLM analysis results (but filter out VIP_CONTACT since we've already handled it)
      if (analysis.context) {
        for (const item of analysis.context) {
          // Skip items with invalid data
          if (!item || !item.key || !item.value) {
            this.logger.warn("Skipping context item with invalid data:", item);
            continue;
          }

          let key = ContextKey.OTHER;
          let priority: number | undefined;

          // Safely convert to strings
          const keyStr = String(item.key || "");
          const valueStr = String(item.value || "");
          const keyUpper = keyStr.toUpperCase();
          const keyLower = keyStr.toLowerCase();
          const valueLower = valueStr.toLowerCase();

          // Skip VIP_CONTACT from LLM - we determine VIP contacts from starred emails
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

          // Check if an OTHER item actually describes urgency/importance and should be reclassified
          // This prevents duplication between OTHER and URGENT/NOT_IMPORTANT
          if (keyUpper === "OTHER" || keyStr === "" || keyUpper === "") {
            const urgencyKeywords = [
              'urgent', 'priority', 'quick reply', 'immediately', 'important', 
              'prioritizes', 'prioritize', 'prioritizing', 'quickly', 'fast response',
              'responds quickly', 'replies quickly', 'urgent', 'high priority'
            ];
            const notImportantKeywords = [
              'not important', 'deprioritize', 'unread', 'does not read', 
              'ignores', 'low priority', 'doesn\'t read', 'never reads',
              'does not reply', 'doesn\'t reply', 'never replies', 'not replied',
              'consistently unread', 'consistently ignored'
            ];
            
            // Check if it should be URGENT instead
            const hasUrgencyKeyword = urgencyKeywords.some(kw => valueLower.includes(kw));
            const hasUrgencyBehavior = valueLower.includes('quick') && 
              (valueLower.includes('reply') || valueLower.includes('respond'));
            
            if (hasUrgencyKeyword || hasUrgencyBehavior) {
              key = ContextKey.URGENT;
              this.logger.log(
                `[CONTEXT-ANALYSIS] Reclassifying OTHER item to URGENT: ${valueStr.substring(0, 50)}...`,
              );
            }
            
            // Check if it should be NOT_IMPORTANT instead
            const hasNotImportantKeyword = notImportantKeywords.some(kw => valueLower.includes(kw));
            if (hasNotImportantKeyword && !hasUrgencyKeyword && !hasUrgencyBehavior) {
              key = ContextKey.NOT_IMPORTANT;
              this.logger.log(
                `[CONTEXT-ANALYSIS] Reclassifying OTHER item to NOT_IMPORTANT: ${valueStr.substring(0, 50)}...`,
              );
            }
          }

          // Map exact enum keys first
          if (keyUpper === "USER_INFO" || keyUpper === "USER") {
            key = ContextKey.USER_INFO;
          } else if (
            keyUpper === "CURRENT_TOPIC" ||
            keyUpper === "WORKING_ON" ||
            keyUpper === "PROJECT"
          ) {
            key = ContextKey.WORKING_ON;
            // Try to extract priority from value
            if (valueLower.includes("high") || valueLower.includes("urgent")) {
              priority = 1;
            } else if (valueLower.includes("low")) {
              priority = 3;
            } else {
              priority = 2;
            }
          } else if (keyUpper === "URGENT") {
            key = ContextKey.URGENT;
          } else if (
            keyUpper === "NOT_IMPORTANT" ||
            keyUpper === "NOT IMPORTANT"
          ) {
            key = ContextKey.NOT_IMPORTANT;
          } else if (
            keyUpper === "MY_GOALS" ||
            keyUpper === "GOALS" ||
            keyUpper === "GOAL"
          ) {
            key = ContextKey.MY_GOALS;
          } else if (keyUpper === "DONT_CARE" || keyUpper === "DON'T_CARE") {
            key = ContextKey.DONT_CARE;
          } else {
            // Fallback to keyword matching for flexibility
            if (
              keyLower.includes("vip") ||
              keyLower.includes("important contact")
            ) {
              key = ContextKey.VIP_CONTACT;
            } else if (keyLower.includes("urgent")) {
              key = ContextKey.URGENT;
            } else if (
              keyLower.includes("not important") ||
              keyLower.includes("notimportant") ||
              keyLower.includes("don't care") ||
              keyLower.includes("ignore")
            ) {
              key = ContextKey.NOT_IMPORTANT;
            } else if (
              keyLower.includes("goal") ||
              keyLower.includes("objective")
            ) {
              key = ContextKey.MY_GOALS;
            } else if (
              keyLower.includes("working on") ||
              keyLower.includes("project") ||
              keyLower.includes("topic") ||
              keyLower.includes("focus")
            ) {
              key = ContextKey.WORKING_ON;
              if (
                valueLower.includes("high") ||
                valueLower.includes("urgent")
              ) {
                priority = 1;
              } else if (valueLower.includes("low")) {
                priority = 3;
              } else {
                priority = 2;
              }
            } else if (
              keyLower.includes("user") ||
              keyLower.includes("about me") ||
              keyLower.includes("preference")
            ) {
              key = ContextKey.USER_INFO;
            }
          }

          // Check for existing similar context before creating (deduplication)
          // First check exact match
          const exactMatch = await this.contextRepository
            .createQueryBuilder("context")
            .where("context.userId = :userId", { userId })
            .andWhere("context.contextKey = :key", { key })
            .andWhere(
              "LOWER(TRIM(context.contextValue)) = LOWER(TRIM(:value))",
              { value: valueStr },
            )
            .getOne();

          if (exactMatch) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Skipping exact duplicate context: ${key} - ${valueStr.substring(0, 50)}...`,
            );
            continue; // Skip exact duplicates
          }

          // Check for similar/overlapping context using similarity matching
          const existingContexts = await this.contextRepository.find({
            where: { userId, contextKey: key },
          });

          let isSimilar = false;
          for (const existing of existingContexts) {
            if (this.areContextValuesSimilar(valueStr, existing.contextValue)) {
              this.logger.log(
                `[CONTEXT-ANALYSIS] Skipping similar/overlapping context: ${key} - "${valueStr.substring(0, 50)}..." (similar to existing: "${existing.contextValue.substring(0, 50)}...")`,
              );
              isSimilar = true;
              break;
            }
          }

          if (isSimilar) {
            continue; // Skip similar entries
          }

          const explanationStr = item.source ? String(item.source) : undefined;
          await this.createOrUpdateContext(
            userId,
            key,
            valueStr,
            Source.AUTOGENERATED,
            priority,
            explanationStr,
          );
          this.logger.log(
            `[CONTEXT-ANALYSIS] Added context: ${key} - ${valueStr.substring(0, 50)}...`,
          );
        }

        await this.usersService.update(userId, {
          scanProgress: 85,
          scanTotal: 100,
        });
        this.logger.log(`[CONTEXT-ANALYSIS] Extracting Q&A from user replies...`);
      }

      // Step 3.5: Extract Q&A from user replies (emails the user sent)
      // Use sent emails from Gmail instead of database
      await this.extractQAndAFromSentEmails(userId, sentEmailsData);

      // Store statistics for final summary in analysis record (all stats should be updated by now)
      const analysisStatsForDb = {
        totalThreads: analysisStats.totalThreads || threadsInRange.length,
        outboundEmails: analysisStats.outboundEmails || sentEmailsData.length,
        threadsNeverOpened: analysisStats.threadsNeverOpened || 0,
        threadsReadButNotReplied: analysisStats.threadsReadButNotReplied || 0,
        vipContactsEvaluated: analysisStats.vipContactsEvaluated || 0,
      };
      
      analysisRecord.stats = analysisStatsForDb;
      await this.contextAnalysisRepository.save(analysisRecord);
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Stored stats in database: ${JSON.stringify(analysisStatsForDb)}`,
      );

      // 4. Save Writing Style to user's tone settings - extract REAL phrases from actual emails
      if (analysis.writingStyle) {
        const styleRules = [
          `Tone: ${analysis.writingStyle.tone}`,
          `Style: ${analysis.writingStyle.style}`,
        ];

        // Extract actual phrases from real sent emails (not LLM-generated ones)
        // Instead of relying on LLM suggestions, extract common phrases directly from emails
        this.logger.log(
          `[CONTEXT-ANALYSIS] Extracting real phrases from ${sentEmailsData.length} sent emails`,
        );
        
        // Extract common phrases directly from sent emails
        // Only include UNUSUAL phrases (not generic ones)
        // Look for phrases that appear in multiple emails (3+ times) and are distinctive
        const phraseCounts = new Map<string, { count: number; emailIds: string[] }>();
        
        // Generic phrases to exclude
        const genericPhrases = new Set([
          'thank you', 'thanks', 'best regards', 'sincerely', 'hi', 'hello', 'hey',
          'please let me know', 'let me know', 'please', 'thanks for', 'thank you for',
          'i hope', 'hope you', 'looking forward', 'let me', 'i would', 'i will',
          'please find', 'please see', 'as per', 'per your', 'in response to',
          'i wanted to', 'i wanted', 'just wanted', 'just following up', 'following up',
          'quick question', 'quick update', 'quick note', 'just checking', 'checking in',
        ]);
        
        for (const sentEmail of sentEmailsData) {
          // Get only the user's content, not quoted/replied content
          let emailBody = cleanEmailContent(sentEmail.body, sentEmail.htmlBody, 5000);
          
          // Remove quoted/replied content (lines starting with >, On ... wrote:, etc.)
          emailBody = emailBody
            .split('\n')
            .filter(line => {
              const trimmed = line.trim();
              // Remove quoted lines
              if (trimmed.startsWith('>')) return false;
              // Remove "On ... wrote:" lines
              if (/^On .+ wrote:/i.test(trimmed)) return false;
              // Remove "From:" lines in quoted sections
              if (/^From:/i.test(trimmed)) return false;
              // Remove "Sent:" lines in quoted sections
              if (/^Sent:/i.test(trimmed)) return false;
              return true;
            })
            .join('\n');
          
          // Redact PII before extracting phrases
          emailBody = this.redactPII(emailBody, userEmail);
          
          const sentences = emailBody.split(/[.!?]\s+/).filter(s => s.length > 10 && s.length < 200);
          
          // Extract phrases (4-7 word sequences) that might be common
          for (const sentence of sentences) {
            const words = sentence.trim().split(/\s+/);
            // Look for phrases of 4-7 words (more specific than 3-8)
            for (let len = 4; len <= Math.min(7, words.length); len++) {
              for (let i = 0; i <= words.length - len; i++) {
                const phrase = words.slice(i, i + len).join(' ').trim().toLowerCase();
                // Skip if phrase is too generic or short
                if (phrase.length < 20 || phrase.length > 80) continue;
                // Skip generic phrases
                if (genericPhrases.has(phrase)) continue;
                // Skip if starts with generic words
                if (phrase.match(/^(hi|hello|thanks|thank you|best|regards|sincerely|dear|hey|please|i|we|you|the|a|an)/i)) continue;
                // Skip if contains placeholders (already redacted, might be too generic)
                if (phrase.includes('[Name]') || phrase.includes('[Your Email]')) continue;
                
                const existing = phraseCounts.get(phrase);
                if (existing) {
                  if (!existing.emailIds.includes(sentEmail.id)) {
                    existing.count++;
                    existing.emailIds.push(sentEmail.id);
                  }
                } else {
                  phraseCounts.set(phrase, { count: 1, emailIds: [sentEmail.id] });
                }
              }
            }
          }
        }
        
        // Get phrases that appear in 3+ emails (more restrictive), sorted by frequency
        // Only include unusual/distinctive phrases
        const commonPhrases = Array.from(phraseCounts.entries())
          .filter(([phrase, data]) => {
            // Must appear in 3+ emails
            if (data.count < 3) return false;
            // Must be distinctive (not too common words)
            const words = phrase.split(' ');
            const commonWordCount = words.filter(w => 
              ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'].includes(w.toLowerCase())
            ).length;
            // If more than 50% are common words, skip it
            return commonWordCount / words.length < 0.5;
          })
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5) // Top 5 most common unusual phrases
          .map(([phrase, data]) => ({
            phrase: phrase.charAt(0).toUpperCase() + phrase.slice(1), // Capitalize first letter
            emailId: data.emailIds[0], // Use first email ID
            count: data.count,
          }));
        
        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${commonPhrases.length} unusual common phrases appearing in 3+ emails`,
        );

        // Add phrases with email IDs (redacted)
        for (const { phrase, emailId, count } of commonPhrases) {
          styleRules.push(`Common phrase: "${phrase}" (appears ${count} times, from email ${emailId})`);
        }

        // Extract actual email examples with IDs (not LLM-generated)
        if (sentEmailsData.length > 0) {
          // Use actual sent emails as examples, not LLM-generated ones
          const exampleEmails = sentEmailsData.slice(0, 3).map((email) => {
            let cleanBody = cleanEmailContent(email.body, email.htmlBody, 300);
            
            // Remove quoted/replied content
            cleanBody = cleanBody
              .split('\n')
              .filter(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('>')) return false;
                if (/^On .+ wrote:/i.test(trimmed)) return false;
                if (/^From:/i.test(trimmed)) return false;
                if (/^Sent:/i.test(trimmed)) return false;
                return true;
              })
              .join('\n');
            
            // Redact PII
            cleanBody = this.redactPII(cleanBody, userEmail);
            
            return {
              emailId: email.id,
              excerpt: cleanBody.substring(0, 300) + (cleanBody.length > 300 ? '...' : ''),
            };
          });

          for (const example of exampleEmails) {
            // No "Email Example 1/2" labels, just the excerpt with link
          styleRules.push(
              `${example.excerpt} (from email <${example.emailId}>)`,
          );
          }
        }

        await this.usersService.update(userId, {
          toneSettings: {
            rules: styleRules,
          },
        });

        this.logger.log(
          `[CONTEXT-ANALYSIS] Saved writing style with ${commonPhrases.length} real phrases from actual emails`,
        );
      }

      // Ensure analyzed count is set to total for final display
      // CRITICAL: Verify stats are in analysis record BEFORE marking complete
      if (!analysisRecord.stats) {
        this.logger.error(
          `[CONTEXT-ANALYSIS] ERROR: Stats not in analysis record! Creating fallback stats.`,
        );
        // Emergency fallback - create stats from what we know
        analysisRecord.stats = {
          totalThreads: totalThreads,
          outboundEmails: sentEmailsData.length,
          threadsNeverOpened: analysisStats.threadsNeverOpened || 0,
          threadsReadButNotReplied: analysisStats.threadsReadButNotReplied || 0,
          vipContactsEvaluated: analysisStats.vipContactsEvaluated || 0,
        };
      } else {
        // Ensure all fields are populated
        analysisRecord.stats = {
          totalThreads: analysisRecord.stats.totalThreads || totalThreads,
          outboundEmails: analysisRecord.stats.outboundEmails || sentEmailsData.length,
          threadsNeverOpened: analysisRecord.stats.threadsNeverOpened || 0,
          threadsReadButNotReplied: analysisRecord.stats.threadsReadButNotReplied || 0,
          vipContactsEvaluated: analysisRecord.stats.vipContactsEvaluated || 0,
        };
      }
      
      this.logger.log(
        `[CONTEXT-ANALYSIS] Storing completion: analyzed ${totalThreads} threads`,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] Final statistics in database before marking complete: ${JSON.stringify(analysisRecord.stats)}`,
      );
      
      // Mark analysis as complete AFTER stats are verified and stored
      analysisRecord.status = "completed";
      analysisRecord.progress = 100;
      analysisRecord.total = 100;
      analysisRecord.analyzedCount = totalThreads;
      await this.contextAnalysisRepository.save(analysisRecord);
      
      // Also update user scan progress for backward compatibility
      await this.usersService.update(userId, {
        scanProgress: 100,
        scanTotal: 100,
      });
      
      // Double-check stats are still in analysis record after marking complete
      const verifyAnalysis = await this.contextAnalysisRepository.findOne({
        where: { id: analysisRecord.id },
      });
      const verifyStats = verifyAnalysis?.stats;
      this.logger.log(
        `[CONTEXT-ANALYSIS] Verification: stats still in database after completion: ${verifyStats ? 'YES' : 'NO'}`,
      );

      this.logger.log(
        `[Context Analysis] Completed email analysis for user ${userId}. Analyzed ${totalThreads} threads.`,
      );

      // Clear progress after a short delay to allow frontend to see completion
      setTimeout(async () => {
        await this.usersService.update(userId, {
          scanProgress: null,
          scanTotal: null,
        });
      }, 5000);
    } catch (error) {
      // Set error state so frontend can display error message
      this.logger.error(
        `[Context Analysis] FAILED for user ${userId}:`,
        error,
      );
      this.logger.error(
        `[Context Analysis] Error details: ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        // Mark analysis as failed
        if (analysisRecord) {
          analysisRecord.status = "failed";
          analysisRecord.errorMessage = (error instanceof Error ? error.message : String(error))?.substring(0, 500) || "Unknown error";
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
        }, 30000);
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
  ): Promise<UserContext> {
    const existing = await this.contextRepository.findOne({
      where: { userId, contextKey, contextValue },
    });

    if (existing) {
      existing.lastModified = new Date();
      if (source === Source.USER_EDITED) {
        existing.source = Source.USER_EDITED;
      }
      if (priority !== undefined) {
        existing.priority = priority;
      }
      return this.contextRepository.save(existing);
    }

    const context = this.contextRepository.create({
      userId,
      contextKey,
      contextValue,
      source,
      priority,
      explanation,
    });

    return this.contextRepository.save(context);
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

      for (const [key, contexts] of grouped.entries()) {
        if (contexts.length <= 1) continue;

        // Sort by lastModified (keep newest)
        contexts.sort(
          (a, b) =>
            b.lastModified.getTime() - a.lastModified.getTime(),
        );

        // Keep the first (newest) and check others for similarity
        const keep = contexts[0];
        for (let i = 1; i < contexts.length; i++) {
          const current = contexts[i];
          if (this.areContextValuesSimilar(keep.contextValue, current.contextValue)) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Consolidating duplicate: "${current.contextValue.substring(0, 50)}..." (keeping newer: "${keep.contextValue.substring(0, 50)}...")`,
            );
            toDelete.push(current.contextId);
            duplicatesRemoved++;
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
        this.logger.log("[CONTEXT-ANALYSIS] No sent emails found for Q&A extraction");
        return;
      }

      this.logger.log(
        `[CONTEXT-ANALYSIS] Analyzing ${sentEmailsData.length} sent emails for common Q&A patterns...`,
      );

      // Extract Q&A pairs using LLM - analyze what questions the user is answering
      const qaPayload = sentEmailsData.map((e) => ({
        subject: e.subject,
        body: cleanEmailContent(e.body, e.htmlBody, 3000), // Longer body to see full context
        receivedAt: e.receivedAt.toISOString(), // Use receivedAt to match LLM service signature (sentAt renamed)
      }));

      // Call LLM to extract common Q&A from sent emails
      const qaAnalysis = await this.llmService.extractQAndA(qaPayload, userId);

      if (qaAnalysis && qaAnalysis.length > 0) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${qaAnalysis.length} common Q&A pairs`,
        );

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
          
          // Check for similar questions (using word overlap)
          let isDuplicate = false;
          for (const seenQ of seenQuestions) {
            const words1 = new Set(seenQ.split(/\s+/).filter(w => w.length > 3));
            const words2 = new Set(normalizedQuestion.split(/\s+/).filter(w => w.length > 3));
            const intersection = new Set([...words1].filter(w => words2.has(w)));
            const union = new Set([...words1, ...words2]);
            const similarity = intersection.size / union.size;
            // If 70%+ word overlap, consider duplicate
            if (similarity >= 0.7) {
              isDuplicate = true;
              break;
            }
          }
          
          // Check for similar answers
          if (!isDuplicate) {
            for (const seenA of seenAnswers) {
              const words1 = new Set(seenA.split(/\s+/).filter(w => w.length > 3));
              const words2 = new Set(normalizedAnswer.split(/\s+/).filter(w => w.length > 3));
              const intersection = new Set([...words1].filter(w => words2.has(w)));
              const union = new Set([...words1, ...words2]);
              const similarity = intersection.size / union.size;
              // If 70%+ word overlap, consider duplicate
              if (similarity >= 0.7) {
                isDuplicate = true;
                break;
              }
            }
          }
          
          if (isDuplicate) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Skipping duplicate Q&A: ${qa.question.substring(0, 50)}...`,
            );
            continue;
          }

          // Check database for existing similar Q&A
          const existingQA = await this.contextRepository
            .createQueryBuilder("context")
            .where("context.userId = :userId", { userId })
            .andWhere("context.contextKey = :key", { key: ContextKey.Q_AND_A })
            .andWhere("(LOWER(context.contextValue) LIKE LOWER(:question) OR LOWER(context.contextValue) LIKE LOWER(:answer))", {
              question: `%${qa.question.substring(0, 30)}%`,
              answer: `%${qa.answer.substring(0, 30)}%`,
            })
            .getOne();

          if (existingQA) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Skipping Q&A that exists in database: ${qa.question.substring(0, 50)}...`,
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
            `[CONTEXT-ANALYSIS] Added Q&A: ${qa.question.substring(0, 50)}...`,
          );
        }
      }
    } catch (error) {
      this.logger.error("Error extracting Q&A from replies:", error);
      // Don't fail the entire analysis if Q&A extraction fails
    }
  }
}
