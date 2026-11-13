import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";

import { CSP_REPORT_ROUTE } from "../constants/csp-report.constants";
import { CspReportController } from "./csp-report.controller";
import { cspReportBodyParser } from "./csp-report-body-parser.middleware";

/** Receives Content-Security-Policy violation reports from the web app. */
@Module({
  controllers: [CspReportController],
})
export class CspReportModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(cspReportBodyParser)
      .forRoutes({ path: CSP_REPORT_ROUTE, method: RequestMethod.POST });
  }
}
