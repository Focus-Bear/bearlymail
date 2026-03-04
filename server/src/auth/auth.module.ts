import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { EmailsModule } from "../emails/emails.module";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { Office365AccountsModule } from "../office365-accounts/office365-accounts.module";
import { UsersModule } from "../users/users.module";
import { WaitlistModule } from "../waitlist/waitlist.module";
import { ZohoAccountsModule } from "../zoho-accounts/zoho-accounts.module";
import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GmailRequiredGuard } from "./gmail-required.guard";
import { GoogleStrategy } from "./google.strategy";
import { JwtStrategy } from "./jwt.strategy";
import { LocalStrategy } from "./local.strategy";
import { MicrosoftStrategy } from "./microsoft.strategy";
import { ZohoStrategy } from "./zoho.strategy";

@Module({
  imports: [
    UsersModule,
    forwardRef(() => EmailsModule),
    forwardRef(() => GoogleAccountsModule),
    forwardRef(() => Office365AccountsModule),
    forwardRef(() => ZohoAccountsModule),
    forwardRef(() => WaitlistModule),
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
    MicrosoftStrategy,
    ZohoStrategy,
    AdminGuard,
    GmailRequiredGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, AdminGuard, GmailRequiredGuard],
})
export class AuthModule {}
