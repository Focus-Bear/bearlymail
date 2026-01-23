import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { GitHubController } from "./github.controller";
import { GitHubService } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubAppService } from "./github-app.service";
import { GitHubMetadataProcessor } from "./github-metadata.processor";
import { UsersModule } from "../users/users.module";
import { EmailsModule } from "../emails/emails.module";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailThread, Email]),
    ConfigModule,
    UsersModule,
    forwardRef(() => EmailsModule),
  ],
  controllers: [GitHubController],
  providers: [
    GitHubService,
    GitHubApiService,
    GitHubAppService,
    GitHubMetadataProcessor,
  ],
  exports: [GitHubService, GitHubApiService, GitHubAppService],
})
export class GitHubModule {}
