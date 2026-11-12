import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  releaseStaleRuleCategory,
  type ReleaseStaleRuleCategoryArgs,
} from "./stale-rule-category.helper";

/**
 * Injectable wrapper around {@link releaseStaleRuleCategory}, shared by the
 * single-email and batch refine paths so both re-decide a thread whose rule
 * label no longer fits its newest email.
 */
@Injectable()
export class StaleRuleCategoryService {
  private readonly logger = new Logger(StaleRuleCategoryService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly categoryRulesService: CategoryRulesService,
  ) {}

  release(args: ReleaseStaleRuleCategoryArgs): Promise<boolean> {
    return releaseStaleRuleCategory(
      {
        emailRepository: this.emailRepository,
        emailThreadRepository: this.emailThreadRepository,
        categoryRulesService: this.categoryRulesService,
        logger: this.logger,
      },
      args,
    );
  }
}
