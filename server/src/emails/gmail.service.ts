import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';
import { EmailsService } from './emails.service';
import { Email } from '../database/entities/email.entity';

@Injectable()
export class GmailService {
  private oauth2Client: any;

  constructor(
    private usersService: UsersService,
    private emailsService: EmailsService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  async syncEmails(userId: number): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log('User not connected to Google');
      return;
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    try {
      // Get list of messages
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 10, // Limit for demo
        q: 'label:INBOX',
      });

      const messages = response.data.messages || [];

      for (const msg of messages) {
        // Check if email already exists
        const existing = await this.emailsService.getEmailById(userId, parseInt(msg.id || '0')); // Note: ID handling needs care in prod (string vs int)
        if (existing) continue;

        // Fetch full message details
        const fullMsg = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });

        const headers = fullMsg.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers.find((h) => h.name === 'From')?.value || '';
        
        // Parse "From" header (e.g., "Name <email@example.com>")
        const fromMatch = from.match(/(.*)<(.+)>/);
        const fromName = fromMatch ? fromMatch[1].trim() : undefined;
        const fromEmail = fromMatch ? fromMatch[2].trim() : from;

        // Simple body extraction (simplified for demo)
        let body = fullMsg.data.snippet || '';
        
        // Save to DB
        await this.emailsService.createEmail(userId, {
          messageId: msg.id!,
          threadId: msg.threadId!,
          subject,
          from: fromEmail,
          fromName,
          body,
          receivedAt: new Date(parseInt(fullMsg.data.internalDate || Date.now().toString())),
        });
      }
    } catch (error) {
      console.error('Error syncing emails:', error);
    }
  }
}

