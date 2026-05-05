import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";

import { KmsEncryptionService } from "./kms-encryption.service";
import { UserEncryptionService } from "./user-encryption.service";
import { runWithUserKey } from "./user-encryption-context";

interface RequestWithUser {
  user?: { userId?: string };
}

/**
 * Global NestJS interceptor that resolves the current user's AES data key from KMS
 * and makes it available to TypeORM column transformers via AsyncLocalStorage.
 *
 * No-op when KMS is disabled (`KMS_KEY_ID` unset) or for unauthenticated routes.
 */
@Injectable()
export class UserEncryptionInterceptor implements NestInterceptor {
  constructor(
    private readonly userEncryptionService: UserEncryptionService,
    private readonly kmsService: KmsEncryptionService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (!this.kmsService.isEnabled()) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request?.user?.userId;

    if (!userId) {
      return next.handle();
    }

    const key = await this.userEncryptionService.getUserKey(userId);

    return new Observable((subscriber) =>
      runWithUserKey(key, () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err: unknown) => subscriber.error(err),
          complete: () => subscriber.complete(),
        }),
      ),
    );
  }
}
