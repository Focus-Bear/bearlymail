import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { google } from 'googleapis';
import { UsersService } from '../../users/users.service';
import { EmailsService } from '../emails.service';
import { ScanEmailService } from '../scan-email.service';
import { EmailProvider, RawEmailMessage } from '../interfaces/email-provider.interface';
import { Email } from '../../database/entities/email.entity';
import PgBoss = require('pg-boss');

@Injectable()
export class GmailProvider implements EmailProvider {
  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    private emailsService: EmailsService,
    private scanEmailService: ScanEmailService,
    @Inject('PG_BOSS') private readonly boss: PgBoss,
  ) {}

  async isConnected(userId: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    return !!(user?.googleCalendarAccessToken);
  }

  async syncEmails(userId: string): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log(`User ${userId} not connected to Gmail, skipping email sync.`);
      return;
    }

    // GRACE PERIOD: If user just logged in (within last 5 minutes), be lenient with errors
    // Check if tokens were just updated (user likely just logged in)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const now = new Date();
    // Ensure we're comparing UTC timestamps correctly
    const userUpdatedAt = user.updatedAt ? new Date(user.updatedAt) : null;
    const isRecentLogin = userUpdatedAt && userUpdatedAt.getTime() > fiveMinutesAgo.getTime();
    const minutesSinceUpdate = userUpdatedAt ? Math.round((now.getTime() - userUpdatedAt.getTime()) / 1000 / 60) : null;
    
    const debugInfo = [
      `[GmailProvider] User ${userId} sync check:`,
      `  - updatedAt: ${user?.updatedAt?.toISOString() || 'null'}`,
      `  - minutesSinceUpdate: ${minutesSinceUpdate}`,
      `  - fiveMinutesAgo: ${fiveMinutesAgo.toISOString()}`,
      `  - isRecentLogin: ${isRecentLogin}`,
      `  - hasRefreshToken: ${!!user.googleCalendarRefreshToken}`,
      `  - hasAccessToken: ${!!user.googleCalendarAccessToken}`,
    ].join('\n');
    console.log(debugInfo);
    const { writeDebugLog } = require('../../auth/auth-logger');
    writeDebugLog(debugInfo);
    
    // Check if refresh token exists - if not, user needs to re-authenticate
    if (!user.googleCalendarRefreshToken) {
      // Log auth failure
      const { authLogger } = require('../../auth/auth-logger');
      authLogger.logAuthFailure(
        userId,
        user?.email || null,
        'syncEmails-missingRefreshToken',
        new Error('Refresh token missing'),
        {
          hasAccessToken: !!user?.googleCalendarAccessToken,
          isRecentLogin,
          userUpdatedAt: user?.updatedAt?.toISOString() || null,
          minutesSinceUpdate,
        }
      );
      
      // Only set needsRelogin if NOT within grace period (recent logins might have token propagation delay)
      if (!isRecentLogin && !user.needsRelogin) {
        await this.usersService.update(userId, { needsRelogin: true });
        throw new Error('Refresh token missing - please log in again');
      } else if (isRecentLogin) {
        console.warn(`⚠️ Refresh token missing for recently logged-in user ${userId}, but within grace period. Will retry later.`);
        throw new Error('Refresh token missing (within grace period - will retry)');
      }
      throw new Error('Refresh token missing - please log in again');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Handle token refresh events
    oauth2Client.on('tokens', async (tokens) => {
      console.log(`Tokens refreshed for user ${userId}`);
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && { googleCalendarRefreshToken: tokens.refresh_token }),
        });
      }
    });

    // Try to proactively refresh the token to catch refresh token issues early
    try {
      await oauth2Client.getAccessToken();
      console.log(`Token validated for user ${userId}`);
    } catch (refreshError: any) {
      // GRACE PERIOD: If user just logged in, don't flag for re-login immediately
      // Re-fetch user to check updatedAt timestamp
      let currentUser = user;
      try {
        currentUser = await this.usersService.findOne(userId);
      } catch (userError) {
        // If we can't fetch user, use the one we already have
        console.error(`Could not re-fetch user ${userId} for grace period check:`, userError);
      }
      
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isRecentLogin = currentUser?.updatedAt && new Date(currentUser.updatedAt) > fiveMinutesAgo;
      
      // Log comprehensive auth failure details
      const { authLogger } = require('../../auth/auth-logger');
      authLogger.logAuthFailure(
        userId,
        currentUser?.email || null,
        'syncEmails-tokenRefresh',
        refreshError,
        {
          hasRefreshToken: !!currentUser?.googleCalendarRefreshToken,
          hasAccessToken: !!currentUser?.googleCalendarAccessToken,
          refreshTokenLength: currentUser?.googleCalendarRefreshToken?.length || 0,
          isRecentLogin,
          userUpdatedAt: currentUser?.updatedAt?.toISOString() || null,
          gracePeriodActive: isRecentLogin,
        }
      );
      
      // Only flag for re-login if it's NOT a recent login (grace period)
      // Recent logins might have temporary token issues that resolve quickly
      if (!isRecentLogin) {
        await this.usersService.update(userId, { needsRelogin: true });
        throw new Error('Token refresh failed - please log in again');
      } else {
        // Recent login - log but don't fail yet (give it time to stabilize)
        console.warn(`⚠️ Token refresh failed for recently logged-in user ${userId}, but within grace period. Will retry later.`);
        throw new Error('Token refresh failed (within grace period - will retry)');
      }
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      // Fetch unread/new emails AND all starred emails to update star status
      // This ensures we catch star status changes even for read emails
      // Fetch starred emails separately to ensure we get all of them (not limited by maxResults)
      const [unreadResponse, starredResponse] = await Promise.all([
        // Fetch unread emails from inbox
        gmail.users.messages.list({
          userId: 'me',
          maxResults: 50,
          q: 'is:unread label:INBOX -label:SnoozedFocusBear -label:VA-to-action',
        }),
        // Fetch ALL starred emails (no maxResults limit, use pagination if needed)
        gmail.users.messages.list({
          userId: 'me',
          maxResults: 500, // Increased to catch all starred emails
          q: 'is:starred -label:SnoozedFocusBear -label:VA-to-action',
        }),
      ]);
      
      // Combine and deduplicate message IDs
      const unreadMessages = unreadResponse.data.messages || [];
      const starredMessages = starredResponse.data.messages || [];
      const allMessageIds = new Set([
        ...unreadMessages.map(m => m.id!),
        ...starredMessages.map(m => m.id!),
      ]);
      // Create message objects in the format expected by the rest of the code
      const messages = Array.from(allMessageIds).map(id => ({ id }));
      
      console.log(`Found ${unreadMessages.length} unread messages and ${starredMessages.length} starred messages (${messages.length} unique) for user ${userId}`);
      
      // Also check threads in our DB to see if they've been archived/starred in Gmail
      // Get recent threads from our DB and check their status in Gmail
      // Do this asynchronously so it doesn't slow down the main sync
      this.syncThreadArchivedStatus(userId, gmail).catch(err => 
        console.error('Error in background thread archived status sync:', err)
      );

      for (const msg of messages) {
        if (!msg.id) continue;

        const fullMsg = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });

        const rawEmail = this.parseGmailMessage(fullMsg.data);
        if (!rawEmail) continue;

        const existing = await this.emailsService.getEmailByMessageId(userId, msg.id);
        if (existing) {
          // Update thread-level metadata (starred status and archived status) for existing emails
          // This ensures status changes in Gmail are reflected in our app
          const newStarCount = rawEmail.starCount || 0;
          const labelIds = fullMsg.data.labelIds || [];
          const isArchivedInGmail = !labelIds.includes('INBOX');
          
          // Update EmailThread instead of individual Email
          if (existing.threadId) {
            await this.emailsService.updateThreadStarCount(userId, existing.threadId, newStarCount);
            await this.emailsService.updateThreadArchivedStatus(userId, existing.threadId, isArchivedInGmail);
          }
          
          // Note: We don't update body/htmlBody as those shouldn't change for the same messageId
          // If they did change, it would be a different messageId anyway
          continue;
        }

        await this.emailsService.createEmail(userId, {
          messageId: rawEmail.messageId,
          threadId: rawEmail.threadId,
          subject: rawEmail.subject,
          from: rawEmail.from,
          fromName: rawEmail.fromName,
          body: rawEmail.body,
          htmlBody: rawEmail.htmlBody,
          starCount: rawEmail.starCount || 0,
          receivedAt: rawEmail.receivedAt,
        } as any);
      }
    } catch (error: any) {
      // Check for authentication errors - these indicate the refresh token is invalid/expired
      const isAuthError = 
        error.code === 401 || 
        (error.response && error.response.status === 401) ||
        error.code === 'invalid_grant' ||
        (error.response?.data?.error === 'invalid_grant') ||
        (error.message && (
          error.message.includes('invalid_grant') ||
          error.message.includes('Refresh token missing') ||
          error.message.includes('Token refresh failed')
        ));
      
      if (isAuthError) {
        // Log comprehensive auth failure details
        // Re-fetch user to check grace period
        let currentUser = user;
        try {
          currentUser = await this.usersService.findOne(userId);
        } catch (userError) {
          console.error(`Could not re-fetch user ${userId} for auth logging:`, userError);
        }
        
        // GRACE PERIOD: Don't flag for re-login if user just logged in (within 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isRecentLogin = currentUser?.updatedAt && new Date(currentUser.updatedAt) > fiveMinutesAgo;
        
        const { authLogger } = require('../../auth/auth-logger');
        authLogger.logAuthFailure(
          userId,
          currentUser?.email || null,
          'syncEmails-gmailApi',
          error,
          {
            hasRefreshToken: !!currentUser?.googleCalendarRefreshToken,
            hasAccessToken: !!currentUser?.googleCalendarAccessToken,
            gmailApiEndpoint: 'users.messages.list',
            isRecentLogin,
            userUpdatedAt: currentUser?.updatedAt?.toISOString() || null,
            gracePeriodActive: isRecentLogin,
          }
        );
        
        // Only flag for re-login if NOT within grace period
        if (!isRecentLogin) {
          await this.usersService.update(userId, { needsRelogin: true });
        } else {
          console.warn(`⚠️ Auth error for recently logged-in user ${userId} (${currentUser?.email}), but within grace period. Will retry later.`);
        }
        throw error;
      }
      
      // Log other errors too (but not as auth failures)
      console.error(`❌ Error syncing emails for user ${userId}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Check threads in our DB to see if they've been archived or starred in Gmail
   * This ensures archived and starred status stays in sync
   */
  private async syncThreadArchivedStatus(userId: string, gmail: any): Promise<void> {
    try {
      // Get ALL non-archived thread IDs from our DB (not just recent ones)
      // This ensures we check starred status for all threads, not just recent ones
      const threadIds = await this.emailsService.getAllNonArchivedThreadIds(userId);
      
      if (threadIds.length === 0) {
        return; // No threads to check
      }

      console.log(`📦 Checking archived and starred status for ${threadIds.length} threads`);

      // Check each thread's status in Gmail
      for (const threadId of threadIds) {
        try {
          const thread = await gmail.users.threads.get({
            userId: 'me',
            id: threadId,
            format: 'metadata',
            metadataHeaders: ['Subject'],
          });

          const labelIds = thread.data.labelIds || [];
          const isArchivedInGmail = !labelIds.includes('INBOX');
          const isStarredInGmail = labelIds.includes('STARRED');
          const starCount = isStarredInGmail ? 3 : 0; // Gmail starred = 3 stars

          // Update archived status if changed
          if (isArchivedInGmail) {
            console.log(`📦 Thread ${threadId.substring(0, 8)}... is archived in Gmail, updating thread`);
            await this.emailsService.updateThreadArchivedStatus(userId, threadId, true);
          }

          // Update starred status on EmailThread
          const emailThread = await this.emailsService.getOrCreateEmailThread(userId, threadId, starCount, isArchivedInGmail);
          if (emailThread.starCount !== starCount) {
            console.log(`⭐ Thread ${threadId.substring(0, 8)}... is starred in Gmail, updating star count to ${starCount}`);
            await this.emailsService.updateThreadStarCount(userId, threadId, starCount);
          }
        } catch (threadError: any) {
          // Thread might not exist anymore (deleted), or we don't have access
          if (threadError.code === 404) {
            // Thread deleted in Gmail - mark as archived
            console.log(`📦 Thread ${threadId.substring(0, 8)}... not found in Gmail, marking as archived`);
            await this.emailsService.updateThreadArchivedStatus(userId, threadId, true);
          } else {
            // Other error - log but continue
            console.warn(`⚠️ Error checking thread ${threadId.substring(0, 8)}...:`, threadError.message);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error syncing thread archived/starred status:', error);
      // Don't throw - this is a background sync, don't fail the main sync
    }
  }

  async scanHistory(userId: string): Promise<void> {
    console.log(`Starting historical email scan for user ${userId}`);
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log(`User ${userId} not connected to Gmail, skipping historical scan.`);
      return;
    }

    // Check if refresh token exists
    if (!user.googleCalendarRefreshToken) {
      const { authLogger } = require('../../auth/auth-logger');
      authLogger.logAuthFailure(
        userId,
        user?.email || null,
        'scanHistory-missingRefreshToken',
        new Error('Refresh token missing'),
        {
          hasAccessToken: !!user?.googleCalendarAccessToken,
        }
      );
      await this.usersService.update(userId, { needsRelogin: true });
      throw new Error('Refresh token missing - please log in again');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Proactively refresh token
    try {
      await oauth2Client.getAccessToken();
      console.log(`Token validated for user ${userId} for historical scan.`);
    } catch (refreshError: any) {
      const { authLogger } = require('../../auth/auth-logger');
      authLogger.logAuthFailure(
        userId,
        user?.email || null,
        'scanHistory-tokenRefresh',
        refreshError,
        {
          hasRefreshToken: !!user?.googleCalendarRefreshToken,
          hasAccessToken: !!user?.googleCalendarAccessToken,
        }
      );
      await this.usersService.update(userId, { needsRelogin: true });
      throw new Error('Token refresh failed during historical scan - please log in again');
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const query = `after:${Math.floor(sevenDaysAgo.getTime() / 1000)} (label:INBOX OR label:SENT)`;

      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 300,
        q: query,
      });

      const messages = response.data.messages || [];
      console.log(`Found ${messages.length} historical messages for user ${userId}. Queuing individual jobs for parallel processing.`);

      await this.usersService.update(userId, { scanTotal: messages.length, scanProgress: 0 });

      // Queue individual jobs for each message - send in parallel batches for faster queuing
      const messageIds = messages.filter(msg => msg.id).map(msg => msg.id!);
      
      // Send jobs in batches of 50 to avoid overwhelming the queue system
      const BATCH_SIZE = 50;
      for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
        const batch = messageIds.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(messageId =>
            this.boss.send('scan-history-email', { userId, messageId })
          )
        );
      }
      
      console.log(`Queued ${messageIds.length} email scan jobs for parallel processing (out of ${messages.length} messages)`);
    } catch (error: any) {
      // Check for authentication errors
      const isAuthError = 
        error.code === 401 || 
        (error.response && error.response.status === 401) ||
        error.code === 'invalid_grant' ||
        (error.response?.data?.error === 'invalid_grant') ||
        (error.message && error.message.includes('invalid_grant'));
      
      if (isAuthError) {
        // Try to get user, but don't fail if we can't
        let userForLogging = null;
        let userEmail = null;
        try {
          userForLogging = await this.usersService.findOne(userId);
          userEmail = userForLogging?.email || null;
        } catch (userError) {
          console.error(`Could not fetch user ${userId} for auth logging:`, userError);
        }
        
        const { authLogger } = require('../../auth/auth-logger');
        authLogger.logAuthFailure(
          userId,
          userEmail,
          'scanHistory-gmailApi',
          error,
          {
            hasRefreshToken: !!userForLogging?.googleCalendarRefreshToken,
            hasAccessToken: !!userForLogging?.googleCalendarAccessToken,
            gmailApiEndpoint: 'users.messages.list (scanHistory)',
          }
        );
        await this.usersService.update(userId, { needsRelogin: true });
      }
      
      await this.usersService.update(userId, { scanProgress: 0, scanTotal: 0 });
      throw error;
    }
  }

  async processScanEmail(userId: string, messageId: string): Promise<void> {
    const startTime = Date.now();
    console.log(`[processScanEmail] Starting to process email ${messageId} for user ${userId}`);
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log(`[processScanEmail] User ${userId} not connected, skipping`);
      return;
    }

    // Check if email already exists in temporary scan table
    const existing = await this.scanEmailService.findByMessageId(userId, messageId);
    if (existing) {
      // Update progress atomically even if already exists
      const result = await this.usersService.incrementScanProgress(userId);
      if (result.isComplete) {
        // Trigger analysis job when scan completes
        await this.boss.send('analyze-scan-results', { userId });
      }
      const duration = Date.now() - startTime;
      console.log(`[processScanEmail] Skipped existing email ${messageId} in ${duration}ms`);
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const rawEmail = this.parseGmailMessage(fullMsg.data);
      if (!rawEmail) {
        // Update progress atomically even if parsing fails
        const result = await this.usersService.incrementScanProgress(userId);
        if (result.isComplete) {
          await this.boss.send('analyze-scan-results', { userId });
        }
        const duration = Date.now() - startTime;
        console.log(`[processScanEmail] Failed to parse email ${messageId} in ${duration}ms`);
        return;
      }

      // Save to temporary scan table instead of main emails table
      const labelIds = fullMsg.data.labelIds || [];
      await this.scanEmailService.createScanEmail(userId, {
        messageId: rawEmail.messageId,
        threadId: rawEmail.threadId,
        subject: rawEmail.subject,
        from: rawEmail.from,
        fromName: rawEmail.fromName,
        body: rawEmail.body,
        htmlBody: rawEmail.htmlBody,
        starCount: rawEmail.starCount || 0,
        receivedAt: rawEmail.receivedAt,
        isRead: rawEmail.isRead || !labelIds.includes('UNREAD'),
        isArchived: !labelIds.includes('INBOX'), // Check if archived
      });

      // Update progress atomically after each email - this handles completion check internally
      const result = await this.usersService.incrementScanProgress(userId);
      if (result.isComplete) {
        // Trigger analysis job when scan completes
        console.log(`[processScanEmail] Scan complete for user ${userId}, triggering analysis`);
        await this.boss.send('analyze-scan-results', { userId });
      }
      const duration = Date.now() - startTime;
      console.log(`[processScanEmail] Completed email ${messageId} in ${duration}ms`);
    } catch (error: any) {
      console.error(`Error processing message ${messageId} for user ${userId}:`, error);
      // Still update progress atomically on error
      const result = await this.usersService.incrementScanProgress(userId);
      if (result.isComplete) {
        await this.boss.send('analyze-scan-results', { userId });
      }
      if (error.code === 401 || (error.response && error.response.status === 401) ||
          (error.message && error.message.includes('invalid_grant'))) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
    }
  }

  async sendReply(
    userId: string,
    threadId: string,
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error('Gmail account not connected. Cannot send email.');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const emailContent = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `In-Reply-To: <${threadId}@mail.gmail.com>`,
      `References: <${threadId}@mail.gmail.com>`,
      '',
      body,
    ].join('\n');

    const encodedEmail = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
          threadId: threadId,
        },
      });
      console.log(`Reply sent successfully for user ${userId} to ${to}`);
    } catch (error: any) {
      console.error(`Failed to send reply for user ${userId} to ${to}:`, error);
      if (error.code === 401 || (error.response && error.response.status === 401) ||
          (error.message && error.message.includes('invalid_grant'))) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw new Error('Failed to send reply');
    }
  }

  private parseGmailMessage(messageData: any): RawEmailMessage | null {
    if (!messageData.id || !messageData.threadId) return null;

    const headers = messageData.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const labelIds = messageData.labelIds || [];
    // Convert Gmail STARRED label to starCount: STARRED = 3 stars (high importance)
    const starCount = labelIds.includes('STARRED') ? 3 : 0;

    const fromMatch = from.match(/(.*)<(.+)>/);
    const fromName = fromMatch ? fromMatch[1].trim() : undefined;
    const fromEmail = fromMatch ? fromMatch[2].trim() : from;

    const { body, htmlBody } = this.extractBodyFromPayload(messageData.payload);

    return {
      messageId: messageData.id,
      threadId: messageData.threadId,
      subject,
      from: fromEmail,
      fromName,
      body,
      htmlBody,
      starCount,
      receivedAt: new Date(parseInt(messageData.internalDate || Date.now().toString())),
      isRead: !labelIds.includes('UNREAD'),
      labelIds,
    };
  }

  private extractBodyFromPayload(payload: any): { body: string; htmlBody?: string } {
    let body = '';
    let htmlBody: string | undefined;

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.parts) {
          const nested = this.extractBodyFromPayload(part);
          if (!body) body = nested.body;
          if (!htmlBody) htmlBody = nested.htmlBody;
        }
      }
    } else if (payload.body?.data) {
      if (payload.mimeType === 'text/plain') {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      }
      if (payload.mimeType === 'text/html') {
        htmlBody = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      }
    }
    
    // Ensure body is never empty (required by DB constraint)
    // Fallback to snippet, HTML body (stripped), or placeholder
    if (!body || body.trim() === '') {
      if (htmlBody) {
        // Strip HTML tags as fallback
        body = htmlBody.replace(/<[^>]*>/g, '').trim();
      }
      if (!body || body.trim() === '') {
        body = payload.snippet || '(No content)';
      }
    }
    
    return { body, htmlBody };
  }

  async searchEmails(userId: string, query: string, maxResults: number = 50): Promise<RawEmailMessage[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log(`User ${userId} not connected to Gmail, cannot search emails.`);
      return [];
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && { googleCalendarRefreshToken: tokens.refresh_token }),
        });
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      // Use Gmail API search
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(maxResults, 100), // Gmail API limit is 100
      });

      const messages = response.data.messages || [];
      const rawEmails: RawEmailMessage[] = [];

      // Fetch full message details for each result
      for (const msg of messages.slice(0, maxResults)) {
        if (!msg.id) continue;

        try {
          const fullMsg = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });

          const rawEmail = this.parseGmailMessage(fullMsg.data);
          if (rawEmail) {
            rawEmails.push(rawEmail);
          }
        } catch (error) {
          console.error(`Error fetching message ${msg.id} during search:`, error);
          // Continue with other messages
        }
      }

      return rawEmails;
    } catch (error: any) {
      console.error(`Error searching emails for user ${userId}:`, error);
      if (error.code === 401 || (error.response && error.response.status === 401) ||
          (error.message && error.message.includes('invalid_grant'))) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw error;
    }
  }
}

