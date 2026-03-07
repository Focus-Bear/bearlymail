import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import * as fs from "fs";
import mjml from "mjml";
import * as path from "path";

import { isError } from "../types/common";
import { translateEmail } from "./email-translations";

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
    let mjmlTemplate = fs.readFileSync(templatePath, "utf-8");

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
