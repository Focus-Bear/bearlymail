import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { AppleMailAccountsModule } from "../apple-mail-accounts/apple-mail-accounts.module";
import { AuditModule } from "../audit/audit.module";
import { EmailModule } from "../email/email.module";
import { EmailsModule } from "../emails/emails.module";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { Office365AccountsModule } from "../office365-accounts/office365-accounts.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { UsersModule } from "../users/users.module";
import { WaitlistModule } from "../waitlist/waitlist.module";
import { ZohoAccountsModule } from "../zoho-accounts/zoho-accounts.module";
import { AdminGuard } from "./admin.guard";
import { AppleMailLocalAuthController } from "./apple-mail-local-auth.controller";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailProviderRequiredGuard } from "./email-provider-required.guard";
import { EmailAccountRequiredGuard } from "./gmail-required.guard";
import { GoogleStrategy } from "./google.strategy";
import { JwtStrategy } from "./jwt.strategy";
import { LocalStrategy } from "./local.strategy";
import { MicrosoftStrategy } from "./microsoft.strategy";
import { OptionalJwtAuthGuard } from "./optional-jwt-auth.guard";
import { StepUpAuthGuard } from "./step-up.guard";
import { TotpService } from "./totp.service";
import { ZohoStrategy } from "./zoho.strategy";

@Module({
  imports: [
    UsersModule,
    AuditModule,
    EmailModule,
    forwardRef(() => EmailsModule),
    forwardRef(() => GoogleAccountsModule),
    forwardRef(() => Office365AccountsModule),
    forwardRef(() => ZohoAccountsModule),
    forwardRef(() => AppleMailAccountsModule),
    forwardRef(() => WaitlistModule),
    forwardRef(() => OrganizationsModule),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    TotpService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    MicrosoftStrategy,
    ZohoStrategy,
    AdminGuard,
    EmailAccountRequiredGuard,
    OptionalJwtAuthGuard,
    StepUpAuthGuard,
    EmailProviderRequiredGuard,
  ],
  controllers: [AuthController, AppleMailLocalAuthController],
  exports: [
    AuthService,
    TotpService,
    AdminGuard,
    EmailAccountRequiredGuard,
    EmailProviderRequiredGuard,
    PassportModule,
    JwtModule,
    OptionalJwtAuthGuard,
    StepUpAuthGuard,
  ],
})
export class AuthModule {}
