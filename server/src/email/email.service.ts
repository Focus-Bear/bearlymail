import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import * as fs from "fs";
import mjml from "mjml";
import * as path from "path";

import { isError } from "../types/common";
import { translateEmail } from "./email-translations";

/** The one notification-template variable that may carry pre-escaped HTML. */
const PREESCAPED_TEMPLATE_VAR = "details";

/** MJML templates keyed by path, read from disk once per process. */
const templateCache = new Map<string, string>();

function loadTemplate(templatePath: string): string {
  let template = templateCache.get(templatePath);
  if (template === undefined) {
    template = fs.readFileSync(templatePath, "utf-8");
    templateCache.set(templatePath, template);
  }
  return template;
}

export interface BookingEmailDetails {
  hostName: string;
  hostEmail: string;
  guestName?: string;
  guestEmail: string;
  title: string;
  whenFormatted: string;
  durationMinutes: number;
  additionalGuests: string[];
  meetLink: string | null;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly sesClient: SESClient;
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>("AWS_REGION") || "us-east-1";
    this.sesClient = new SESClient({ region });
    this.fromEmail =
      this.configService.get<string>("SES_FROM_EMAIL") ||
      "noreply@bearlymail.com";
  }

  async sendWaitlistApprovalEmail(
    toEmail: string,
    firstName: string,
    setupToken: string,
    language: string = "en",
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";
    const setupUrl = `${frontendUrl}/setup-password?token=${setupToken}`;

    // Get translations
    const token = (key: string, params: Record<string, string> = {}) =>
      translateEmail(`waitlistApproval.${key}`, language, params);

    const subject = token("subject");
    const year = new Date().getFullYear().toString();

    // Load MJML template
    const templatePath = path.join(
      __dirname,
      "templates",
      "waitlist-approval.mjml",
    );
    let mjmlTemplate = loadTemplate(templatePath);

    // Replace template variables
    mjmlTemplate = mjmlTemplate
      .replace(/\{\{previewText\}\}/g, token("message", { firstName }))
      .replace(/\{\{greeting\}\}/g, token("greeting", { firstName }))
      .replace(/\{\{message\}\}/g, token("message", { firstName }))
      .replace(/\{\{cta\}\}/g, token("cta"))
      .replace(/\{\{button\}\}/g, token("button"))
      .replace(/\{\{linkText\}\}/g, token("linkText"))
      .replace(/\{\{setupUrl\}\}/g, setupUrl)
      .replace(/\{\{expiry\}\}/g, token("expiry"))
      .replace(/\{\{footer\}\}/g, token("footer", { year }));

    // Convert MJML to HTML
    const { html, errors } = mjml(mjmlTemplate, {
      validationLevel: "soft",
    });

    if (errors && errors.length > 0) {
      this.logger.warn("MJML conversion warnings:", errors);
    }

    // Generate plain text version
    const textBody = `
${token("greeting", { firstName })}

${token("message", { firstName })}

${token("cta")}

${setupUrl}

${token("expiry")}

${token("footer", { year })}
    `;

    await this.sendEmail(toEmail, subject, html, textBody);
  }

  /**
   * Sent when someone joins the waitlist, so signups get immediate feedback.
   * Tells them their spot is reserved and that approval arrives by email later.
   */
  async sendWaitlistConfirmationEmail(
    toEmail: string,
    firstName: string,
    language: string = "en",
  ): Promise<void> {
    const translate = (key: string, params: Record<string, string> = {}) =>
      translateEmail(`waitlistConfirmation.${key}`, language, params);

    const year = new Date().getFullYear().toString();
    const greeting = translate("greeting", { firstName });
    const message = translate("message");
    const nextSteps = translate("nextSteps");
    const footer = translate("footer", { year });

    const html = this.renderNotificationHtml({
      previewText: message,
      greeting,
      message,
      details: this.escapeHtml(nextSteps),
      footer,
    });
    const textBody = [greeting, message, nextSteps, footer].join("\n\n");

    await this.sendEmail(toEmail, translate("subject"), html, textBody);
  }

  /** Sent to the guest after they book a slot via the public booking page. */
  async sendBookingConfirmationEmail(
    details: BookingEmailDetails,
    language: string = "en",
  ): Promise<void> {
    const translate = (key: string, params: Record<string, string> = {}) =>
      translateEmail(`bookingConfirmation.${key}`, language, params);

    const subject = translate("subject", { title: details.title });
    const greeting = translate("greeting", {
      name: details.guestName || details.guestEmail,
    });
    const message = translate("message", { hostName: details.hostName });

    await this.sendBookingEmail({
      toEmail: details.guestEmail,
      subject,
      greeting,
      message,
      details,
      language,
    });
  }

  /** Sent to the BearlyMail account owner when someone books one of their slots. */
  async sendBookingOwnerNotificationEmail(
    details: BookingEmailDetails,
    language: string = "en",
  ): Promise<void> {
    const translate = (key: string, params: Record<string, string> = {}) =>
      translateEmail(`bookingOwnerNotification.${key}`, language, params);

    const guestName = details.guestName || details.guestEmail;
    const subject = translate("subject", {
      guestName,
      when: details.whenFormatted,
    });
    const greeting = translate("greeting", { name: details.hostName });
    const message = translate("message", {
      guestName,
      guestEmail: details.guestEmail,
    });

    await this.sendBookingEmail({
      toEmail: details.hostEmail,
      subject,
      greeting,
      message,
      details,
      language,
    });
  }

  private async sendBookingEmail(options: {
    toEmail: string;
    subject: string;
    greeting: string;
    message: string;
    details: BookingEmailDetails;
    language: string;
  }): Promise<void> {
    const { toEmail, subject, greeting, message, details, language } = options;
    const year = new Date().getFullYear().toString();
    const footer = translateEmail("bookingConfirmation.footer", language, {
      year,
    });
    const lines = this.buildBookingDetailLines(details, language);

    const html = this.renderNotificationHtml({
      previewText: message,
      greeting,
      message,
      details: lines.map((line) => this.escapeHtml(line)).join("<br />"),
      footer,
    });
    const textBody = [greeting, message, lines.join("\n"), footer].join("\n\n");

    await this.sendEmail(toEmail, subject, html, textBody);
  }

  private buildBookingDetailLines(
    details: BookingEmailDetails,
    language: string,
  ): string[] {
    const label = (key: string, params: Record<string, string> = {}) =>
      translateEmail(`bookingDetails.${key}`, language, params);

    const lines = [
      `${label("title")}: ${details.title}`,
      `${label("when")}: ${details.whenFormatted}`,
      `${label("duration")}: ${label("durationMinutes", {
        minutes: String(details.durationMinutes),
      })}`,
    ];
    if (details.additionalGuests.length > 0) {
      lines.push(
        `${label("additionalGuests")}: ${details.additionalGuests.join(", ")}`,
      );
    }
    if (details.meetLink) {
      lines.push(`${label("meetLink")}: ${details.meetLink}`);
    }
    return lines;
  }

  /**
   * Renders the shared notification template, HTML-escaping every variable
   * except `details`, which may carry pre-escaped content with <br /> breaks.
   */
  private renderNotificationHtml(vars: {
    previewText: string;
    greeting: string;
    message: string;
    details: string;
    footer: string;
  }): string {
    const templatePath = path.join(__dirname, "templates", "notification.mjml");
    let mjmlTemplate = loadTemplate(templatePath);

    for (const [key, value] of Object.entries(vars)) {
      const safeValue =
        key === PREESCAPED_TEMPLATE_VAR ? value : this.escapeHtml(value);
      mjmlTemplate = mjmlTemplate.replace(
        new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
        () => safeValue,
      );
    }

    const { html, errors } = mjml(mjmlTemplate, { validationLevel: "soft" });
    if (errors && errors.length > 0) {
      this.logger.warn("MJML conversion warnings:", errors);
    }
    return html;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async sendPasswordResetEmail(
    toEmail: string,
    firstName: string,
    resetToken: string,
    language: string = "en",
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Get translations
    const translate = (key: string, params: Record<string, string> = {}) =>
      translateEmail(`passwordReset.${key}`, language, params);

    const subject = translate("subject");
    const year = new Date().getFullYear().toString();

    // Load MJML template
    const templatePath = path.join(
      __dirname,
      "templates",
      "password-reset.mjml",
    );
    let mjmlTemplate = loadTemplate(templatePath);

    // Replace template variables
    mjmlTemplate = mjmlTemplate
      .replace(/\{\{previewText\}\}/g, translate("message", { firstName }))
      .replace(/\{\{greeting\}\}/g, translate("greeting", { firstName }))
      .replace(/\{\{message\}\}/g, translate("message", { firstName }))
      .replace(/\{\{cta\}\}/g, translate("cta"))
      .replace(/\{\{button\}\}/g, translate("button"))
      .replace(/\{\{linkText\}\}/g, translate("linkText"))
      .replace(/\{\{resetUrl\}\}/g, resetUrl)
      .replace(/\{\{expiry\}\}/g, translate("expiry"))
      .replace(/\{\{footer\}\}/g, translate("footer", { year }));

    // Convert MJML to HTML
    const { html, errors } = mjml(mjmlTemplate, {
      validationLevel: "soft",
    });

    if (errors && errors.length > 0) {
      this.logger.warn("MJML conversion warnings:", errors);
    }

    // Generate plain text version
    const textBody = `
${translate("greeting", { firstName })}

${translate("message", { firstName })}

${translate("cta")}

${resetUrl}

${translate("expiry")}

${translate("footer", { year })}
    `;

    await this.sendEmail(toEmail, subject, html, textBody);
  }

  private async sendEmail(
    toEmail: string,
    subject: string,
    htmlBody: string,
    textBody: string,
  ): Promise<void> {
    try {
      const command = new SendEmailCommand({
        Source: this.fromEmail,
        Destination: {
          ToAddresses: [toEmail],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: "UTF-8",
            },
            Text: {
              Data: textBody,
              Charset: "UTF-8",
            },
          },
        },
      });

      const response = await this.sesClient.send(command);
      this.logger.log(
        `Email sent successfully to ${toEmail}. MessageId: ${response.MessageId}`,
      );
    } catch (error: unknown) {
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (
        typeof error === "object" &&
        error !== null &&
        "message" in error
      ) {
        errorMessage = String((error as { message?: unknown }).message);
      } else {
        errorMessage = "Unknown error";
      }
      this.logger.error(
        `Failed to send email to ${toEmail}: ${errorMessage}`,
        isError(error) ? error.stack : undefined,
      );
      throw error;
    }
  }
}
