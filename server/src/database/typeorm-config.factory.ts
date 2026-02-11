import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";

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
  const isLocal = dbHost === "localhost" || dbHost === "127.0.0.1";
  const sslEnabled = configService.get<string>("DB_SSL") === "true";
  const useSsl = !isLocal || sslEnabled ? { rejectUnauthorized: false } : false;

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
    ...overrides,
  } as TypeOrmModuleOptions;
}
