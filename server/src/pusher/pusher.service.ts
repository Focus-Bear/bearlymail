import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Pusher from "pusher";

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
    await this.trigger(`user-${userId}`, "contacts-sync-complete", {
      results,
    });
  }

  async triggerContactSyncStarted(userId: string): Promise<void> {
    await this.trigger(`user-${userId}`, "contacts-sync-started", {});
  }

  async triggerContactSyncFailed(userId: string, error: string): Promise<void> {
    await this.trigger(`user-${userId}`, "contacts-sync-failed", {
      error,
    });
  }
}
