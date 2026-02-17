import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { GitHubController } from "./github.controller";
import { GitHubService } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubAppService } from "./github-app.service";
import { GitHubMetadataProcessor } from "./github-metadata.processor";
import { UsersModule } from "../users/users.module";
import { EmailsModule } from "../emails/emails.module";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { GitHubRepoMapping } from "../database/entities/github-repo-mapping.entity";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailThread, Email, GitHubRepoMapping]),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET") || "your-secret-key",
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    forwardRef(() => EmailsModule),
  ],
  controllers: [GitHubController],
  providers: [
    GitHubService,
    GitHubApiService,
    GitHubAppService,
    GitHubMetadataProcessor,
    GitHubRepoMappingService,
  ],
  exports: [
    GitHubService,
    GitHubApiService,
    GitHubAppService,
    GitHubRepoMappingService,
  ],
})
export class GitHubModule {}
