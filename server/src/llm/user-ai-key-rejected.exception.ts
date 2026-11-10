import { HttpException, HttpStatus } from "@nestjs/common";

import {
  findUserAiProvider,
  USER_AI_KEY_REJECTED_CODE,
  type UserAiProvider,
} from "../constants/user-ai-providers.constants";

/**
 * A provider refused the user's own key. Deliberately not a 401: the client
 * treats 401 as "your BearlyMail session ended" and logs the user out.
 */
export class UserAiKeyRejectedException extends HttpException {
  constructor(readonly provider: UserAiProvider) {
    const name = findUserAiProvider(provider)?.displayName ?? provider;
    super(
      {
        statusCode: HttpStatus.FAILED_DEPENDENCY,
        code: USER_AI_KEY_REJECTED_CODE,
        provider,
        message: `${name} rejected your API key (it may be invalid, revoked or out of credit). Update it in Settings → Use your own AI account.`,
      },
      HttpStatus.FAILED_DEPENDENCY,
    );
  }
}
