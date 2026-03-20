import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

/**
 * Handles invite email dispatch for the organization invite flow.
 * Uses AWS SES (same infrastructure as EmailService) to send
 * HTML invite emails with a one-time accept link.
 */
@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);
  private readonly sesClient: SESClient;
  private readonly fromEmail: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>("AWS_REGION") ?? "us-east-1";
    this.sesClient = new SESClient({ region });
    this.fromEmail =
      this.configService.get<string>("SES_FROM_EMAIL") ??
      "noreply@bearlymail.com";
    this.frontendUrl =
      this.configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
  }

  /**
   * Sends a team invite email to the given address.
   *
   * @param toEmail        - Recipient email address (plaintext)
   * @param inviterName    - Display name of the person who sent the invite
   * @param orgName        - Organisation name (plaintext, already decrypted)
   * @param inviteToken    - 32-byte random hex token for the accept link
   */
  async sendInviteEmail(
    toEmail: string,
    inviterName: string,
    orgName: string,
    inviteToken: string,
  ): Promise<void> {
    const acceptUrl = `${this.frontendUrl}/accept-invite/${inviteToken}`;
    const year = new Date().getFullYear();

    const subject = `${inviterName} invited you to join ${orgName} on BearlyMail`;

    const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #4F46E5; padding: 32px 40px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; }
    .body { padding: 32px 40px; }
    .body p { color: #374151; line-height: 1.6; margin: 0 0 16px; }
    .cta { text-align: center; margin: 32px 0; }
    .cta a { display: inline-block; background: #4F46E5; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; }
    .footer { padding: 24px 40px; background: #F9FAFB; text-align: center; }
    .footer p { color: #9CA3AF; font-size: 12px; margin: 0; }
    .expiry { color: #6B7280; font-size: 13px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🐻 BearlyMail</h1>
    </div>
    <div class="body">
      <p>Hi there,</p>
      <p><strong>${inviterName}</strong> has invited you to join the <strong>${orgName}</strong> team on BearlyMail — the AI-powered email client designed for focused work.</p>
      <div class="cta">
        <a href="${acceptUrl}">Accept Invitation</a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${acceptUrl}" style="color:#4F46E5;word-break:break-all;">${acceptUrl}</a></p>
      <p class="expiry">This invite link expires in 7 days. If you weren't expecting this invitation, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; ${year} BearlyMail. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    const textBody = `${inviterName} invited you to join ${orgName} on BearlyMail.

Accept your invite: ${acceptUrl}

This link expires in 7 days.

If you weren't expecting this, you can ignore this email.

© ${year} BearlyMail`;

    await this.sendRawEmail(toEmail, subject, htmlBody, textBody);
  }

  private async sendRawEmail(
    toEmail: string,
    subject: string,
    htmlBody: string,
    textBody: string,
  ): Promise<void> {
    try {
      const command = new SendEmailCommand({
        Source: this.fromEmail,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: htmlBody, Charset: "UTF-8" },
            Text: { Data: textBody, Charset: "UTF-8" },
          },
        },
      });

      const response = await this.sesClient.send(command);
      this.logger.log(
        `Invite email sent to ${toEmail}. MessageId: ${response.MessageId}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send invite to ${toEmail}: ${message}`);
      throw error;
    }
  }
}
