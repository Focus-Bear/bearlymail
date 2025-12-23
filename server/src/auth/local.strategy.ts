import { Strategy } from "passport-local";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: "email" });
  }

  async validate(email: string, password: string): Promise<any> {
    try {
      const user = await this.authService.validateUser(email, password);
      if (!user) {
        throw new UnauthorizedException("Invalid email or password");
      }
      return user;
    } catch (error: any) {
      // If it's already an UnauthorizedException, re-throw it
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // If it's an approval error, convert to UnauthorizedException with message
      if (error.message && error.message.includes("pending approval")) {
        throw new UnauthorizedException(error.message);
      }
      // For other errors, re-throw as UnauthorizedException
      throw new UnauthorizedException(error.message || "Authentication failed");
    }
  }
}
