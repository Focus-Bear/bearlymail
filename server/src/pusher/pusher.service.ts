import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Pusher from "pusher";

import {
  EmailSendFailureReason,
  EmailSendType,
} from "../constants/email-send.constants";
import { PUSHER_EVENTS, userChannel } from "../constants/pusher-events";

/** Payload of {@link PUSHER_EVENTS.EMAIL_SEND_SUCCEEDED}. */
export interface EmailSendSucceededPayload {
  /** Correlation id returned by the send endpoint. */
  sendId: string;
  sendType: EmailSendType;
  /** Source email for a reply/forward; absent for a composed message. */
  emailId?: string;
  /** The provider's real ids — the reason the client waits for this event. */
  messageId: string;
  threadId: string;
}

/** Payload of {@link PUSHER_EVENTS.EMAIL_SEND_FAILED}. */
export interface EmailSendFailedPayload {
  sendId: string;
  sendType: EmailSendType;
  emailId?: string;
  /** Machine-readable code the client turns into translated copy. */
  reason: EmailSendFailureReason;
}

@Injectable()
export class PusherService {
  private readonly logger = new Logger(PusherService.name);
  private pusher: Pusher | null = null;

  constructor(private configService: ConfigService) {
    const appId = this.configService.get<string>("PUSHER_APP_ID");
    const key = this.configService.get<string>("PUSHER_KEY");
    const secret = this.configService.get<string>("PUSHER_SECRET");
    const cluster = this.configService.get<string>("PUSHER_CLUSTER");

    if (appId && key && secret && cluster) {
      this.pusher = new Pusher({
        appId,
        key,
        secret,
        cluster,
        useTLS: true,
      });
      this.logger.log("Pusher initialized successfully");
    } else {
      this.logger.warn(
        "Pusher not configured - missing PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, or PUSHER_CLUSTER",
      );
    }
  }

  async trigger(
    channel: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.pusher) {
      this.logger.debug(
        `Pusher not configured, skipping event ${event} on ${channel}`,
      );
      return;
    }

    try {
      await this.pusher.trigger(channel, event, payload);
    } catch (error) {
      this.logger.error(
        `Failed to send Pusher event ${event} on ${channel}:`,
        error,
      );
    }
  }

  async triggerContactSyncComplete(
    userId: string,
    results: { synced: number; provider: string }[],
  ): Promise<void> {
    await this.trigger(
      userChannel(userId),
      PUSHER_EVENTS.CONTACTS_SYNC_COMPLETE,
      { results },
    );
  }

  async triggerContactSyncStarted(userId: string): Promise<void> {
    await this.trigger(
      userChannel(userId),
      PUSHER_EVENTS.CONTACTS_SYNC_STARTED,
      {},
    );
  }

  async triggerContactSyncFailed(userId: string, error: string): Promise<void> {
    await this.trigger(
      userChannel(userId),
      PUSHER_EVENTS.CONTACTS_SYNC_FAILED,
      {
        error,
      },
    );
  }

  /**
   * Confirms a background send actually reached the provider, carrying the real
   * message/thread ids. Until this lands the client's "sent" state is optimistic.
   */
  async triggerEmailSendSucceeded(
    userId: string,
    payload: EmailSendSucceededPayload,
  ): Promise<void> {
    await this.trigger(
      userChannel(userId),
      PUSHER_EVENTS.EMAIL_SEND_SUCCEEDED,
      {
        ...payload,
      },
    );
  }

  /**
   * Tells the client a background send failed for good, so it can retract the
   * optimistic "sent" state and offer a retry instead of silently losing the
   * message.
   */
  async triggerEmailSendFailed(
    userId: string,
    payload: EmailSendFailedPayload,
  ): Promise<void> {
    await this.trigger(userChannel(userId), PUSHER_EVENTS.EMAIL_SEND_FAILED, {
      ...payload,
    });
  }
}
