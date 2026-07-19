import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";

import {
  BOOLEAN_STRING_VALUES,
  LOCALHOST_VALUES,
} from "../constants/domain-types";

/**
 * Shared TypeORM configuration factory used by both AppModule and WorkerModule.
 *
 * Uses `autoLoadEntities: true` so any entity registered via TypeOrmModule.forFeature()
 * in an imported module is automatically available — no manual entity list needed.
 *
 * Pass `overrides` to layer on environment-specific options (e.g. query logger,
 * migrations path) without duplicating the base connection config.
 */
export function createTypeOrmConfig(
  configService: ConfigService,
  overrides?: Partial<TypeOrmModuleOptions>,
): TypeOrmModuleOptions {
  const dbHost = configService.get<string>("DB_HOST");
  const isLocal =
    dbHost === LOCALHOST_VALUES.LOCALHOST || dbHost === "127.0.0.1";
  const sslEnabled =
    configService.get<string>("DB_SSL") === BOOLEAN_STRING_VALUES.TRUE;
  const sslDisabled =
    configService.get<string>("DB_SSL") === BOOLEAN_STRING_VALUES.FALSE;
  const sslRequired = sslEnabled || (!isLocal && !sslDisabled);
  // nosemgrep
  const useSsl = sslRequired ? { rejectUnauthorized: false } : false;
  // Safer default: 4 processes × 5 = 20 TypeORM connections
  const poolSize = parseInt(
    configService.get<string>("DB_POOL_SIZE") || "5",
    10,
  );

  return {
    type: "postgres",
    host: dbHost || "localhost",
    port: parseInt(configService.get<string>("DB_PORT") || "5432"),
    username: configService.get<string>("DB_USERNAME") || "postgres",
    password: configService.get<string>("DB_PASSWORD") || "postgres",
    database: configService.get<string>("DB_NAME") || "adhd_email_client",
    // Automatically load entities registered via TypeOrmModule.forFeature()
    // in any imported module. This eliminates the need to maintain a manual
    // entity list — adding an entity to a module's forFeature() is enough.
    autoLoadEntities: true,
    synchronize: false,
    ssl: useSsl,
    // Explicit connection pool settings to prevent exhausting RDS max_connections.
    // Both the web server and worker processes each create their own pool, so
    // keeping this bounded is critical. Tune DB_POOL_SIZE in production based
    // on your RDS instance's max_connections limit.
    extra: {
      max: poolSize,
      // Release idle connections to free up RDS slots
      min: 0,
      // Reduced: release idle connections faster
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    },
    ...overrides,
  } as TypeOrmModuleOptions;
}
