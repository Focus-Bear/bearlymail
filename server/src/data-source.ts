import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import * as path from "path";
import { DataSource } from "typeorm";

import {
  BOOLEAN_STRING_VALUES,
  LOCALHOST_VALUES,
} from "./constants/domain-types";

// Load environment variables
config({ path: path.join(__dirname, "../.env") });

const configService = new ConfigService();

const dbHost = configService.get<string>("DB_HOST") || "localhost";
const isLocal = dbHost === LOCALHOST_VALUES.LOCALHOST || dbHost === "127.0.0.1";
const sslEnabled =
  configService.get<string>("DB_SSL") === BOOLEAN_STRING_VALUES.TRUE;
const sslDisabled =
  configService.get<string>("DB_SSL") === BOOLEAN_STRING_VALUES.FALSE;

// Use SSL if explicitly enabled, or if not local and not explicitly disabled
const sslRequired = sslEnabled || (!isLocal && !sslDisabled);
// nosemgrep
const useSsl = sslRequired ? { rejectUnauthorized: false } : false;

export default new DataSource({
  type: "postgres",
  host: dbHost,
  port: parseInt(configService.get<string>("DB_PORT") || "5432", 10),
  username: configService.get<string>("DB_USERNAME") || "postgres",
  password: configService.get<string>("DB_PASSWORD") || "postgres",
  database: configService.get<string>("DB_NAME") || "adhd_email_client",
  entities: [`${__dirname}/**/*.entity{.ts,.js}`],
  // Only include migrations in the root migrations folder, not archived subfolder
  migrations: [`${__dirname}/database/migrations/*{.ts,.js}`],
  // NEVER use synchronize in production - always use migrations
  synchronize: false,
  ssl: useSsl,
  logging: ["error", "warn", "migration"],
  // Allow individual migrations to override transaction mode (e.g. ALTER TYPE ... ADD VALUE
  // cannot run inside a PostgreSQL transaction, so those migrations set transaction = false)
  migrationsTransactionMode: "each",
});
