import { Inject, Injectable } from "@nestjs/common";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailArchiveService } from "./email-archive.service";
import { EmailCrudService } from "./email-crud.service";
import { EmailDebugService } from "./email-debug.service";
import { EmailGmailService } from "./email-gmail.service";
import { EmailInboxService } from "./email-inbox.service";
import { EmailLifecycleService } from "./email-lifecycle.service";
import { EmailPriorityExplanationService } from "./email-priority-explanation.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailReadService } from "./email-read.service";
import { EmailSearchService } from "./email-search.service";
import { EmailStarService } from "./email-star.service";
import { EmailStatusService } from "./email-status.service";
import { EmailThreadService } from "./email-thread.service";

/**
 * Token for the first group of EmailsService dependencies (repositories + 5 services).
 * Splits the 15-param constructor into two groups to respect max-params limits. See issue #939.
 */
export const EMAIL_DEPS_REPOS = Symbol("EMAIL_DEPS_REPOS");

/**
 * Token for the second group of EmailsService dependencies (remaining 8 services).
 * See issue #939.
 */
export const EMAIL_DEPS_SERVICES = Symbol("EMAIL_DEPS_SERVICES");

/**
 * Sub-token A: repositories + provider manager (3 items).
 */
export const EMAIL_DEPS_REPOS_A = Symbol("EMAIL_DEPS_REPOS_A");

/**
 * Sub-token B: thread/search/star/debug/read services (5 items).
 */
export const EMAIL_DEPS_REPOS_B = Symbol("EMAIL_DEPS_REPOS_B");

/**
 * Sub-token C: crud/gmail/status/inbox/priority services (5 items).
 */
export const EMAIL_DEPS_SERVICES_A = Symbol("EMAIL_DEPS_SERVICES_A");

/**
 * Sub-token D: lifecycle/archive (2 items).
 */
export const EMAIL_DEPS_SERVICES_B = Symbol("EMAIL_DEPS_SERVICES_B");

/**
 * First group: repositories and provider manager + thread/search/star/debug/read services.
 */
export interface EmailDepsRepos {
  emailRepository: Repository<Email>;
  emailThreadRepository: Repository<EmailThread>;
  emailProviderManager: EmailProviderManager;
  emailThreadService: EmailThreadService;
  emailSearchService: EmailSearchService;
  emailStarService: EmailStarService;
  emailDebugService: EmailDebugService;
  emailReadService: EmailReadService;
}

/**
 * Second group: CRUD, Gmail, status, inbox, priority, lifecycle, and archive services.
 */
export interface EmailDepsServices {
  emailCrudService: EmailCrudService;
  emailGmailService: EmailGmailService;
  emailStatusService: EmailStatusService;
  emailInboxService: EmailInboxService;
  emailPriorityExplanationService: EmailPriorityExplanationService;
  emailLifecycleService: EmailLifecycleService;
  emailArchiveService: EmailArchiveService;
}

/**
 * Merged view of all EmailsService dependencies.
 * EmailsService receives both groups and merges them for internal use.
 */
export type EmailServiceDependencies = EmailDepsRepos & EmailDepsServices;

/**
 * Aggregates both dependency groups for EmailsService injection.
 * EmailsService injects this class (2 params) instead of 15 individual services.
 */
@Injectable()
export class EmailServiceDeps {
  public readonly emailRepository: Repository<Email>;
  public readonly emailThreadRepository: Repository<EmailThread>;
  public readonly emailProviderManager: EmailProviderManager;
  public readonly emailThreadService: EmailThreadService;
  public readonly emailSearchService: EmailSearchService;
  public readonly emailStarService: EmailStarService;
  public readonly emailDebugService: EmailDebugService;
  public readonly emailReadService: EmailReadService;
  public readonly emailCrudService: EmailCrudService;
  public readonly emailGmailService: EmailGmailService;
  public readonly emailStatusService: EmailStatusService;
  public readonly emailInboxService: EmailInboxService;
  public readonly emailPriorityExplanationService: EmailPriorityExplanationService;
  public readonly emailLifecycleService: EmailLifecycleService;
  public readonly emailArchiveService: EmailArchiveService;

  constructor(
    @Inject(EMAIL_DEPS_REPOS) reposGroup: EmailDepsRepos,
    @Inject(EMAIL_DEPS_SERVICES) servicesGroup: EmailDepsServices,
  ) {
    this.emailRepository = reposGroup.emailRepository;
    this.emailThreadRepository = reposGroup.emailThreadRepository;
    this.emailProviderManager = reposGroup.emailProviderManager;
    this.emailThreadService = reposGroup.emailThreadService;
    this.emailSearchService = reposGroup.emailSearchService;
    this.emailStarService = reposGroup.emailStarService;
    this.emailDebugService = reposGroup.emailDebugService;
    this.emailReadService = reposGroup.emailReadService;
    this.emailCrudService = servicesGroup.emailCrudService;
    this.emailGmailService = servicesGroup.emailGmailService;
    this.emailStatusService = servicesGroup.emailStatusService;
    this.emailInboxService = servicesGroup.emailInboxService;
    this.emailPriorityExplanationService =
      servicesGroup.emailPriorityExplanationService;
    this.emailLifecycleService = servicesGroup.emailLifecycleService;
    this.emailArchiveService = servicesGroup.emailArchiveService;
  }
}
