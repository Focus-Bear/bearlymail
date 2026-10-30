import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as path from "path";
import { PgBoss } from "pg-boss";
import { DataSource } from "typeorm";
import type { PostgresDataSourceOptions } from "typeorm/driver/postgres/PostgresDataSourceOptions";

import type { CloudWatchService } from "../../aws/cloudwatch.service";
import { ALL_ENTITIES } from "../../database/entities/all-entities";
import { createTypeOrmConfig } from "../../database/typeorm-config.factory";
import type { PriorityBatchAnalysisRunner } from "../../emails/priority-batch-analysis-runner";
import { encryptionKeyProvider } from "../../encryption/encryption-key-provider";
import type { UserEncryptionService } from "../../encryption/user-encryption.service";
import { PROMPTS_DIR_ENV } from "../../llm/prompts";
import { getErrorMessage } from "../../utils/error-message.util";
import { composePriorityBatchRunner } from "./compose-priority-batch-runner";
import { loadLambdaEnvironment } from "./lambda-environment";
import { createAdvisoryApplySerialiser } from "./priority-run-store";

/**
 * One invocation analyses a single batch with bounded email concurrency, plus
 * one connection for the per-user apply lock. Kept small because up to the
 * function's reserved concurrency of Lambdas share the RDS Proxy.
 */
const LAMBDA_DB_POOL_SIZE = "6";
const LAMBDA_PGBOSS_POOL_SIZE = 2;
/** The bundle ships the prompt markdown next to handler.js. */
const BUNDLED_PROMPTS_DIRNAME = "prompts";

export interface PrioritisationRuntime {
  dataSource: DataSource;
  runner: PriorityBatchAnalysisRunner;
  userEncryptionService: UserEncryptionService;
  cloudWatchService: CloudWatchService;
}

function buildPgBossConnectionString(config: ConfigService): string {
  const user = encodeURIComponent(config.get<string>("DB_USERNAME") ?? "");
  const password = encodeURIComponent(config.get<string>("DB_PASSWORD") ?? "");
  return `postgres://${user}:${password}@${config.get("DB_HOST")}:${config.get("DB_PORT")}/${config.get("DB_NAME")}`;
}

/**
 * pg-boss is only used to enqueue follow-up jobs (summary backfill, category
 * rule generation, fallback requeues) for the worker, so it never supervises,
 * schedules or migrates — the worker owns the schema and queues.
 */
async function startSendOnlyBoss(
  config: ConfigService,
  ssl: PostgresDataSourceOptions["ssl"],
  logger: Logger,
): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: buildPgBossConnectionString(config),
    ssl,
    max: LAMBDA_PGBOSS_POOL_SIZE,
    supervise: false,
    schedule: false,
    migrate: false,
    createSchema: false,
  });
  // RDS Proxy closes idle client connections between invocations; without a
  // listener pg-boss re-emits that as an unhandled 'error' and kills the
  // process. pg reconnects on the next send.
  boss.on("error", (error) =>
    logger.warn(`pg-boss connection error: ${getErrorMessage(error)}`),
  );
  await boss.start();
  return boss;
}

/**
 * Cold-start bootstrap: secrets → global key → DataSource → pg-boss → the
 * hand-built service graph. Reused across warm invocations.
 */
export async function createPrioritisationRuntime(): Promise<PrioritisationRuntime> {
  await loadLambdaEnvironment();
  process.env.DB_POOL_SIZE ??= LAMBDA_DB_POOL_SIZE;
  process.env[PROMPTS_DIR_ENV] ??= path.join(
    __dirname,
    BUNDLED_PROMPTS_DIRNAME,
  );
  await encryptionKeyProvider.initializeFromManagedKey();

  const config = new ConfigService();
  // Same connection settings as the worker; Nest's autoLoadEntities has no
  // module scan to feed it here, so the entities are listed explicitly.
  const dataSourceOptions = createTypeOrmConfig(config, {
    autoLoadEntities: false,
    entities: ALL_ENTITIES,
  }) as PostgresDataSourceOptions;
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  const logger = new Logger("LambdaPrioritisation");
  const boss = await startSendOnlyBoss(config, dataSourceOptions.ssl, logger);
  const composition = composePriorityBatchRunner({
    dataSource,
    boss,
    logger,
    serialiseApply: createAdvisoryApplySerialiser(dataSource),
  });
  await composition.tokenUsageService.onModuleInit();

  return {
    dataSource,
    runner: composition.runner,
    userEncryptionService: composition.userEncryptionService,
    cloudWatchService: composition.cloudWatchService,
  };
}
