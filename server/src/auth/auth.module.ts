import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { LocalStrategy } from "./local.strategy";
import { GoogleStrategy } from "./google.strategy";
import { UsersModule } from "../users/users.module";
import { EmailsModule } from "../emails/emails.module";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { AdminGuard } from "./admin.guard";
import { GmailRequiredGuard } from "./gmail-required.guard";

@Module({
  imports: [
    UsersModule,
    forwardRef(() => EmailsModule),
    forwardRef(() => GoogleAccountsModule),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET") || "your-secret-key",
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    AdminGuard,
    GmailRequiredGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, AdminGuard, GmailRequiredGuard],
})
export class AuthModule {}
