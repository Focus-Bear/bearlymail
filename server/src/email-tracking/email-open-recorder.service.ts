import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  EMAIL_TRACKING_STATUS,
  MAX_OPEN_EVENTS_PER_MESSAGE,
  MAX_STORED_USER_AGENT_LENGTH,
  OPEN_DEDUPE_WINDOW_MS,
  OPEN_GRACE_WINDOW_MS,
  OPEN_SOURCE,
} from "../constants/email-tracking.constants";
import { EmailOpenEvent } from "../database/entities/email-open-event.entity";
import { EmailTracking } from "../database/entities/email-tracking.entity";
import {
  classifyOpenSource,
  isWellFormedTrackingToken,
} from "./tracking-pixel.helpers";

export interface PixelHit {
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  openedAt: Date;
}

interface CountedOpenRow {
  id: string;
  openCount: number;
  automaticOpenCount: number;
}

/**
 * Turns pixel hits into honest open counts.
 *
 * The whole decision — known token, outside the post-send grace window, not a
 * repeat inside the dedupe window — happens in one conditional UPDATE, so a hit
 * costs a single round-trip (plus an INSERT when it counts) and two racing hits
 * can't both be counted.
 */
@Injectable()
export class EmailOpenRecorderService {
  private readonly logger = new Logger(EmailOpenRecorderService.name);

  constructor(
    @InjectRepository(EmailTracking)
    private readonly trackingRepository: Repository<EmailTracking>,
    @InjectRepository(EmailOpenEvent)
    private readonly openEventRepository: Repository<EmailOpenEvent>,
  ) {}

  /** Records a hit if it counts. Never throws — the pixel must always load. */
  async recordOpen(hit: PixelHit): Promise<boolean> {
    if (!isWellFormedTrackingToken(hit.token)) return false;
    try {
      return await this.countOpen(hit);
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to record open: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async countOpen(hit: PixelHit): Promise<boolean> {
    const openSource = classifyOpenSource(hit.userAgent, hit.ipAddress);
    const isLikelyAutomatic = openSource === OPEN_SOURCE.APPLE_PRIVACY_PROXY;
    const counted = await this.incrementCounters(hit, isLikelyAutomatic);
    if (!counted) return false;

    const storedEvents = isLikelyAutomatic
      ? counted.automaticOpenCount
      : counted.openCount;
    if (storedEvents <= MAX_OPEN_EVENTS_PER_MESSAGE) {
      await this.openEventRepository.save(
        this.openEventRepository.create({
          trackingId: counted.id,
          openedAt: hit.openedAt,
          openSource,
          isLikelyAutomatic,
          ipAddress: hit.ipAddress,
          userAgent:
            hit.userAgent?.slice(0, MAX_STORED_USER_AGENT_LENGTH) ?? null,
        }),
      );
    }
    return true;
  }

  private async incrementCounters(
    hit: PixelHit,
    isLikelyAutomatic: boolean,
  ): Promise<CountedOpenRow | null> {
    const graceCutoff = new Date(hit.openedAt.getTime() - OPEN_GRACE_WINDOW_MS);
    const dedupeCutoff = new Date(
      hit.openedAt.getTime() - OPEN_DEDUPE_WINDOW_MS,
    );
    const counters = isLikelyAutomatic
      ? {
          automaticOpenCount: () => `"automaticOpenCount" + 1`,
          lastAutomaticOpenAt: hit.openedAt,
        }
      : {
          openCount: () => `"openCount" + 1`,
          firstOpenedAt: () => `COALESCE("firstOpenedAt", :openedAt)`,
          lastOpenedAt: hit.openedAt,
        };
    const lastSeenColumn = isLikelyAutomatic
      ? `"lastAutomaticOpenAt"`
      : `"lastOpenedAt"`;

    const result = await this.trackingRepository
      .createQueryBuilder()
      .update(EmailTracking)
      .set(counters)
      .where("token = :token", { token: hit.token })
      .andWhere("status = :tracked", {
        tracked: EMAIL_TRACKING_STATUS.TRACKED,
      })
      .andWhere(`"sentAt" <= :graceCutoff`, { graceCutoff })
      .andWhere(
        `(${lastSeenColumn} IS NULL OR ${lastSeenColumn} <= :dedupeCutoff)`,
        { dedupeCutoff },
      )
      .setParameter("openedAt", hit.openedAt)
      .returning(["id", "openCount", "automaticOpenCount"])
      .execute();

    const rows = Array.isArray(result.raw)
      ? (result.raw as CountedOpenRow[])
      : [];
    return rows[0] ?? null;
  }
}
