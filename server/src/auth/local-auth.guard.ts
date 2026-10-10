import { Injectable, Optional } from "@nestjs/common";
import { AuthGuard, AuthModuleOptions } from "@nestjs/passport";

@Injectable()
export class LocalAuthGuard extends AuthGuard("local") {
  /**
   * Nest 12 reads `@Optional()` constructor metadata with `Reflect.getOwnMetadata`
   * instead of `Reflect.getMetadata`, so the optional `AuthModuleOptions` parameter
   * declared on the `AuthGuard()` mixin is no longer inherited by subclasses.
   * Without re-declaring it here, Nest treats `AuthModuleOptions` as required and
   * every module using this guard fails to boot unless it imports `PassportModule`.
   */
  constructor(@Optional() options?: AuthModuleOptions) {
    super(options);
  }
}
