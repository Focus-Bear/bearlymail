import { json, NextFunction, Request, Response } from "express";

import {
  CSP_REPORT_CONTENT_TYPES,
  CSP_REPORT_MAX_BODY_SIZE,
} from "../constants/csp-report.constants";

const BAD_REQUEST = 400;

const parseCspReportJson = json({
  type: CSP_REPORT_CONTENT_TYPES,
  limit: CSP_REPORT_MAX_BODY_SIZE,
});

/**
 * Parses CSP report bodies (`application/csp-report`, `application/reports+json`),
 * which the app-wide JSON parser skips. Oversized or malformed bodies are answered
 * here with a bare 4xx so they never reach the exception filter / error tracking.
 */
export function cspReportBodyParser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  parseCspReportJson(req, res, (error?: unknown) => {
    if (error) {
      const status = (error as { status?: number }).status ?? BAD_REQUEST;
      res.status(status).end();
      return;
    }
    next();
  });
}
