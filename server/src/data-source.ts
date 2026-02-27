import { DataSource } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import * as path from "path";

// Load environment variables
config({ path: path.join(__dirname, "../.env") });

const configService = new ConfigService();

const dbHost = configService.get<string>("DB_HOST") || "localhost";
const isLocal = dbHost === "localhost" || dbHost === "127.0.0.1";
const sslEnabled = configService.get<string>("DB_SSL") === "true";
const sslDisabled = configService.get<string>("DB_SSL") === "false";

// Use SSL if explicitly enabled, or if not local and not explicitly disabled
const sslRequired = sslEnabled || (!isLocal && !sslDisabled);
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
});
