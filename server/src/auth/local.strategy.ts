import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";

import { User } from "../database/entities/user.entity";
import { AuthService } from "./auth.service";
import { DeletedAccountException } from "./exceptions/deleted-account.exception";

type UserWithoutPassword = Omit<User, "password">;

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: "email" });
  }

  async validate(
    email: string,
    password: string,
  ): Promise<UserWithoutPassword> {
    try {
      const user = await this.authService.validateUser(email, password);
      if (!user) {
        throw new UnauthorizedException("Invalid email or password");
      }
      return user;
    } catch (error: unknown) {
      // DeletedAccountException is an UnauthorizedException — re-throw it
      // before the generic UnauthorizedException check so the structured
      // ACCOUNT_DELETED payload is preserved for the frontend.
      if (error instanceof DeletedAccountException) {
        throw error;
      }
      // If it's already an UnauthorizedException, re-throw it
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // If it's an approval error, convert to UnauthorizedException with message
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (
        typeof error === "object" &&
        error !== null &&
        "message" in error
      ) {
        errorMessage = String((error as { message?: unknown }).message);
      } else {
        errorMessage = "Unknown error";
      }
      if (errorMessage.includes("pending approval")) {
        throw new UnauthorizedException(errorMessage);
      }
      // For other errors, re-throw as UnauthorizedException
      throw new UnauthorizedException(errorMessage || "Authentication failed");
    }
  }
}
