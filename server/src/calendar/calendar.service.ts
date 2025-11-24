import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';
import { LLMService } from '../llm/llm.service';
import { EmailsService } from '../emails/emails.service';

@Injectable()
export class CalendarService {
  private oauth2Client: any;

  constructor(
    private usersService: UsersService,
    private llmService: LLMService,
    private emailsService: EmailsService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback',
    );
  }

  async getAvailableTimeSlots(userId: number, daysAhead: number = 7): Promise<any[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error('Google Calendar not connected');
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const now = new Date();
    const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    try {
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: now.toISOString(),
          timeMax: endDate.toISOString(),
          items: [{ id: 'primary' }],
        },
      });

      // Find free slots (simplified - in production, you'd calculate gaps between busy periods)
      const busy = response.data.calendars?.primary?.busy || [];
      const freeSlots = this.calculateFreeSlots(now, endDate, busy);

      return freeSlots;
    } catch (error) {
      console.error('Error fetching calendar:', error);
      throw new Error('Failed to fetch calendar data');
    }
  }

  private calculateFreeSlots(start: Date, end: Date, busy: any[]): any[] {
    const slots: any[] = [];
    const slotDuration = 30; // 30 minutes
    let current = new Date(start);

    while (current < end) {
      const slotEnd = new Date(current.getTime() + slotDuration * 60 * 1000);
      const isBusy = busy.some((b) => {
        const busyStart = new Date(b.start);
        const busyEnd = new Date(b.end);
        return (current >= busyStart && current < busyEnd) || 
               (slotEnd > busyStart && slotEnd <= busyEnd) ||
               (current <= busyStart && slotEnd >= busyEnd);
      });

      if (!isBusy && current.getHours() >= 9 && current.getHours() < 17) {
        slots.push({
          start: current.toISOString(),
          end: slotEnd.toISOString(),
          duration: slotDuration,
        });
      }

      current = new Date(current.getTime() + slotDuration * 60 * 1000);
    }

    return slots.slice(0, 10); // Return top 10 slots
  }

  async createEvent(
    userId: number,
    startTime: string,
    durationMinutes: number,
    guestEmail: string,
    guestName?: string,
  ): Promise<any> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error('Google Calendar not connected');
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    try {
      const event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: `Meeting with ${guestName || guestEmail}`,
          description: 'Scheduled via ADHD Email Client',
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees: [{ email: guestEmail }],
        },
      });
      return event.data;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw new Error('Failed to create calendar event');
    }
  }

  async generateMeetingReply(
    userId: number,
    emailId: number,
    provider?: 'gemini' | 'openai',
  ): Promise<string> {
    const slots = await this.getAvailableTimeSlots(userId);
    const user = await this.usersService.findOne(userId);
    const email = await this.emailsService.getEmailById(userId, emailId);

    if (!email) {
      throw new Error('Email not found');
    }

    if (slots.length === 0) {
      // Use LLM even for no-slots scenario
      try {
        return await this.llmService.generateMeetingReply(
          {
            from: email.from,
            fromName: email.fromName,
            subject: email.subject,
            body: email.body,
          },
          [],
          process.env.CALENDAR_BOOKING_URL,
          provider as any,
        );
      } catch (error) {
        // Fallback
        return `Hi there,

Thank you for reaching out about scheduling a meeting. Unfortunately, I don't have any available slots in the next week.

Please let me know your availability and I'll do my best to accommodate.

Best regards`;
      }
    }

    // Format slots for LLM
    const formattedSlots = slots.slice(0, 5).map((slot) => ({
      start: slot.start,
      end: slot.end,
    }));

    try {
      return await this.llmService.generateMeetingReply(
        {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        },
        formattedSlots,
        process.env.CALENDAR_BOOKING_URL,
        provider as any,
      );
    } catch (error) {
      console.error('LLM meeting reply generation failed, using fallback', error);
      // Fallback to template-based reply
      const slotsText = slots
        .slice(0, 5)
        .map((slot, i) => {
          const start = new Date(slot.start);
          return `${i + 1}. ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        })
        .join('\n');

      return `Hi there,

Thank you for reaching out about scheduling a meeting. Here are some times that work for me:

${slotsText}

You can also book directly on my calendar: ${process.env.CALENDAR_BOOKING_URL || 'https://calendly.com/your-link'}

Let me know what works best for you!

Best regards`;
    }
  }
}

