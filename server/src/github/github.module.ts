import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { GitHubRepoMapping } from "../database/entities/github-repo-mapping.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsModule } from "../emails/emails.module";
import { UsersModule } from "../users/users.module";
import { GitHubController } from "./github.controller";
import { GitHubService } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubAppService } from "./github-app.service";
import { GitHubCategoryOverrideService } from "./github-category-override.service";
import { GitHubEmailInfoService } from "./github-email-info.service";
import { GitHubMetadataProcessor } from "./github-metadata.processor";
import { GitHubPrEnrichmentService } from "./github-pr-enrichment.service";
import { GitHubProjectStatusService } from "./github-project-status.service";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailThread,
      Email,
      GitHubRepoMapping,
      UserContext,
    ]),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>("JWT_SECRET"),
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
    GitHubProjectStatusService,
    GitHubPrEnrichmentService,
    GitHubAppService,
    GitHubCategoryOverrideService,
    GitHubMetadataProcessor,
    GitHubEmailInfoService,
    GitHubRepoMappingService,
  ],
  exports: [
    GitHubService,
    GitHubApiService,
    GitHubProjectStatusService,
    GitHubPrEnrichmentService,
    GitHubAppService,
    GitHubCategoryOverrideService,
    GitHubEmailInfoService,
    GitHubRepoMappingService,
  ],
})
export class GitHubModule {}
