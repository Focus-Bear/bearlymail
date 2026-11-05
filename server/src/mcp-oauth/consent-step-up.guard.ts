import { ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { StepUpAuthGuard } from "../auth/step-up.guard";

/**
 * Approving a connection gives another app access to the mailbox, so it needs
 * the same step-up as creating a token. Declining gives nothing away, so only
 * an explicit `approve: false` skips it.
 */
@Injectable()
export class ConsentStepUpGuard extends StepUpAuthGuard {
  constructor(jwtService: JwtService) {
    super(jwtService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { body } = context
      .switchToHttp()
      .getRequest<{ body?: { approve?: unknown } }>();
    return body?.approve === false ? true : super.canActivate(context);
  }
}
