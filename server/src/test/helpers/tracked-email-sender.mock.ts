import { Provider } from "@nestjs/common";

import {
  ProviderEmailParams,
  ProviderReplyParams,
  TrackedEmailSender,
} from "../../email-tracking/tracked-email-sender.service";
import { EmailProvider } from "../../emails/interfaces/email-provider.interface";

/**
 * A TrackedEmailSender that forwards straight to the provider, for specs of
 * send paths that assert on the provider call and don't care about tracking.
 */
export function createPassThroughTrackedEmailSender(): Provider {
  return {
    provide: TrackedEmailSender,
    useValue: {
      sendReply: jest.fn(
        (
          userId: string,
          provider: EmailProvider,
          params: ProviderReplyParams,
        ) => provider.sendReply(userId, params),
      ),
      sendEmail: jest.fn(
        (
          userId: string,
          provider: EmailProvider,
          params: ProviderEmailParams,
        ) => provider.sendEmail(userId, params),
      ),
    },
  };
}
