import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { Request } from "express";

import {
  CSP_REPORT_CONTENT_TYPES,
  CSP_REPORT_RATE_LIMIT,
  CSP_REPORT_RATE_WINDOW_MS,
  CSP_REPORT_ROUTE,
} from "../constants/csp-report.constants";
import {
  formatCspViolation,
  summarizeCspReportBody,
} from "./csp-report.summary";

/**
 * Public, unauthenticated sink for the web app's Content-Security-Policy
 * `report-uri` / `report-to` reports: `POST /csp-report`.
 *
 * Logs one compact line per violation (directive, blocked origin/scheme, page
 * origin, disposition) — never paths, query strings or script samples — and
 * always answers 204. The body is read from the request directly (parsed by
 * `cspReportBodyParser`) rather than through `@Body()`, so the global
 * ValidationPipe never sees it.
 */
@Controller(CSP_REPORT_ROUTE)
@SkipThrottle({ feedback: true, polling: true })
export class CspReportController {
  private readonly logger = new Logger(CspReportController.name);

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    default: { limit: CSP_REPORT_RATE_LIMIT, ttl: CSP_REPORT_RATE_WINDOW_MS },
  })
  receive(@Req() request: Request): void {
    // Bodies of any other type were parsed (or not) by the app-wide parsers,
    // without this route's size limit, so they are ignored.
    if (!request.is(CSP_REPORT_CONTENT_TYPES)) return;
    for (const summary of summarizeCspReportBody(request.body)) {
      this.logger.warn(formatCspViolation(summary));
    }
  }
}
