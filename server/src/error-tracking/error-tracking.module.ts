import { Global, Module } from "@nestjs/common";

import { ErrorTrackingService } from "./error-tracking.service";

/**
 * Global module for error tracking
 * This is marked as @Global() so ErrorTrackingService can be injected anywhere
 */
@Global()
@Module({
  providers: [ErrorTrackingService],
  exports: [ErrorTrackingService],
})
export class ErrorTrackingModule {}
