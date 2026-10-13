import { Controller, Get, Headers, Param, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Request, Response } from "express";

import {
  TRACKING_PIXEL_OPEN_SEGMENT,
  TRACKING_PIXEL_RESPONSE_HEADERS,
  TRACKING_PIXEL_ROUTE_PREFIX,
  TRANSPARENT_GIF_BASE64,
} from "../constants/email-tracking.constants";
import { EmailOpenRecorderService } from "./email-open-recorder.service";
import { parseTrackingPixelFilename } from "./tracking-pixel.helpers";

const TRANSPARENT_GIF = Buffer.from(TRANSPARENT_GIF_BASE64, "base64");
const FORWARDED_FOR_HEADER = "x-forwarded-for";
const USER_AGENT_HEADER = "user-agent";

/**
 * The load balancer appends the address it saw as the LAST X-Forwarded-For
 * entry; earlier entries are client-supplied and can be forged.
 */
function resolveClientIp(request: Request): string | null {
  const forwarded = request.headers[FORWARDED_FOR_HEADER];
  const forwardedList = Array.isArray(forwarded)
    ? forwarded.join(",")
    : forwarded;
  const lastHop = forwardedList?.split(",").pop()?.trim();
  return lastHop || request.ip || null;
}

/**
 * Public, unauthenticated open-tracking pixel: `GET /t/o/<token>.gif`.
 *
 * Always answers with the same uncacheable 1x1 GIF — for unknown, malformed or
 * already-counted tokens too — so the response never reveals whether a token
 * exists. The open is recorded after the image is sent, so a slow database
 * never delays the recipient's mail client.
 *
 * Throttling is skipped on purpose: without `trust proxy`, `req.ip` is the load
 * balancer, so an IP throttle would lump every recipient together. A hit costs
 * at most one indexed conditional UPDATE, malformed tokens never reach the
 * database, and repeats inside the dedupe window are not counted.
 */
@Controller(TRACKING_PIXEL_ROUTE_PREFIX)
@SkipThrottle({ default: true, feedback: true, polling: true })
export class TrackingPixelController {
  constructor(private readonly openRecorder: EmailOpenRecorderService) {}

  @Get(`${TRACKING_PIXEL_OPEN_SEGMENT}/:file`)
  servePixel(
    @Param("file") file: string,
    @Headers(USER_AGENT_HEADER) userAgent: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    response.set(TRACKING_PIXEL_RESPONSE_HEADERS).send(TRANSPARENT_GIF);

    const token = parseTrackingPixelFilename(file);
    if (!token) return;
    void this.openRecorder.recordOpen({
      token,
      ipAddress: resolveClientIp(request),
      userAgent: userAgent ?? null,
      openedAt: new Date(),
    });
  }
}
