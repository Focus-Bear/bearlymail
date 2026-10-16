import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  EMAIL_TRACKING_STATUS,
  TrackedSendSource,
  UNTRACKED_REASON,
  UntrackedReason,
} from "../constants/email-tracking.constants";
import { EmailTracking } from "../database/entities/email-tracking.entity";
import { User } from "../database/entities/user.entity";
import {
  EmailProvider,
  EmailRecipient,
} from "../emails/interfaces/email-provider.interface";
import { resolveBackendBaseUrl } from "../utils/backend-base-url.util";
import { parseRecipientsFromString } from "../utils/email-address.utils";
import {
  buildTrackingPixelUrl,
  generateTrackingToken,
  injectTrackingPixel,
  isPubliclyReachableBaseUrl,
  stripTrackingPixels,
} from "./tracking-pixel.helpers";

export type ProviderReplyParams = Parameters<EmailProvider["sendReply"]>[1];
export type ProviderEmailParams = Parameters<EmailProvider["sendEmail"]>[1];

export interface SentMessage {
  messageId: string;
  threadId: string;
}

export interface TrackedSendOptions {
  source: TrackedSendSource;
  /** Per-message choice from the composer; undefined defers to the setting. */
  trackOpens?: boolean;
}

type TrackingPlan =
  | {
      status: typeof EMAIL_TRACKING_STATUS.TRACKED;
      token: string;
      pixelUrl: string;
    }
  | {
      status: typeof EMAIL_TRACKING_STATUS.UNTRACKED;
      untrackedReason: UntrackedReason;
    };

/**
 * Columns that differ between tracked and untracked sends. Recipients are only
 * kept for tracked messages, where they explain who could have opened it.
 */
function describeTrackingOutcome(
  plan: TrackingPlan,
  recipients: EmailRecipient[],
): Pick<EmailTracking, "status" | "token" | "untrackedReason" | "recipients"> {
  if (plan.status === EMAIL_TRACKING_STATUS.UNTRACKED) {
    return {
      status: plan.status,
      token: null,
      untrackedReason: plan.untrackedReason,
      recipients: null,
    };
  }
  return {
    status: plan.status,
    token: plan.token,
    untrackedReason: null,
    recipients: recipients.map((recipient) => recipient.email).join(", "),
  };
}

/**
 * The single choke point for user-originated sends that should carry an
 * open-tracking pixel.
 *
 * Callers hand over the provider call they were about to make; this decides
 * whether the message can be tracked, injects the pixel into the HTML part,
 * dispatches, and records the send (tracked or not, with the reason).
 * Automated sends — auto-responder, workflows, calendar RSVPs — deliberately
 * keep calling the provider directly so they are never tracked.
 */
@Injectable()
export class TrackedEmailSender {
  private readonly logger = new Logger(TrackedEmailSender.name);

  constructor(
    @InjectRepository(EmailTracking)
    private readonly trackingRepository: Repository<EmailTracking>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async sendReply(
    userId: string,
    provider: EmailProvider,
    params: ProviderReplyParams,
    options: TrackedSendOptions,
  ): Promise<SentMessage> {
    const htmlBody = stripTrackingPixels(params.options?.htmlBody);
    // Without an HTML part Gmail sends plain text only, so there is nowhere
    // for an image to live.
    const plan = await this.planTracking(userId, provider, !!htmlBody, options);
    const finalHtml =
      plan.status === EMAIL_TRACKING_STATUS.TRACKED && htmlBody
        ? injectTrackingPixel(htmlBody, plan.pixelUrl)
        : htmlBody;

    const sent = await provider.sendReply(userId, {
      ...params,
      options: params.options && { ...params.options, htmlBody: finalHtml },
    });

    const recipients = [params.to, params.options?.cc, params.options?.bcc]
      .filter((list): list is string => !!list)
      .flatMap(parseRecipientsFromString);
    await this.recordSend(userId, sent, plan, options.source, recipients);
    return sent;
  }

  async sendEmail(
    userId: string,
    provider: EmailProvider,
    params: ProviderEmailParams,
    options: TrackedSendOptions,
  ): Promise<SentMessage> {
    // New messages always go out with an HTML part: providers fall back to
    // treating `body` as HTML when no explicit htmlBody is given.
    const htmlBody = stripTrackingPixels(params.htmlBody ?? params.body);
    const plan = await this.planTracking(userId, provider, true, options);
    const finalHtml =
      plan.status === EMAIL_TRACKING_STATUS.TRACKED
        ? injectTrackingPixel(htmlBody, plan.pixelUrl)
        : htmlBody;

    const sent = await provider.sendEmail(userId, {
      ...params,
      body: stripTrackingPixels(params.body),
      htmlBody: finalHtml,
    });

    const recipients = [
      ...params.to,
      ...(params.cc ?? []),
      ...(params.bcc ?? []),
    ];
    await this.recordSend(userId, sent, plan, options.source, recipients);
    return sent;
  }

  private async planTracking(
    userId: string,
    provider: EmailProvider,
    hasHtmlPart: boolean,
    options: TrackedSendOptions,
  ): Promise<TrackingPlan> {
    const untracked = await this.findUntrackedReason(
      userId,
      provider,
      hasHtmlPart,
      options,
    );
    if (untracked) {
      return {
        status: EMAIL_TRACKING_STATUS.UNTRACKED,
        untrackedReason: untracked,
      };
    }

    const token = generateTrackingToken();
    return {
      status: EMAIL_TRACKING_STATUS.TRACKED,
      token,
      pixelUrl: buildTrackingPixelUrl(resolveBackendBaseUrl(), token),
    };
  }

  private async findUntrackedReason(
    userId: string,
    provider: EmailProvider,
    hasHtmlPart: boolean,
    options: TrackedSendOptions,
  ): Promise<UntrackedReason | null> {
    if (options.trackOpens === false) return UNTRACKED_REASON.MESSAGE_OPT_OUT;
    // An explicit per-message opt-in overrides the account default.
    if (
      options.trackOpens !== true &&
      !(await this.isTrackingEnabled(userId))
    ) {
      return UNTRACKED_REASON.SETTING_DISABLED;
    }
    if (provider.sendsPlainTextOnly)
      return UNTRACKED_REASON.PROVIDER_PLAIN_TEXT;
    if (!hasHtmlPart) return UNTRACKED_REASON.PLAIN_TEXT;
    if (!isPubliclyReachableBaseUrl(resolveBackendBaseUrl())) {
      return UNTRACKED_REASON.NO_PUBLIC_URL;
    }
    return null;
  }

  private async isTrackingEnabled(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, trackEmailOpens: true },
    });
    return user?.trackEmailOpens ?? false;
  }

  /**
   * Never throws: the message is already out, and losing its tracking row must
   * not turn a delivered send into a reported failure.
   */
  private async recordSend(
    userId: string,
    sent: SentMessage,
    plan: TrackingPlan,
    source: TrackedSendSource,
    recipients: EmailRecipient[],
  ): Promise<void> {
    try {
      await this.trackingRepository.save(
        this.trackingRepository.create({
          userId,
          source,
          messageId: sent.messageId || null,
          threadId: sent.threadId || null,
          sentAt: new Date(),
          recipientCount: recipients.length,
          ...describeTrackingOutcome(plan, recipients),
        }),
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to record tracking for message ${sent.messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
