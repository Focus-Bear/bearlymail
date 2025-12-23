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

export default new DataSource({
  type: "postgres",
  host: dbHost,
  port: parseInt(configService.get<string>("DB_PORT") || "5432", 10),
  username: configService.get<string>("DB_USERNAME") || "postgres",
  password: configService.get<string>("DB_PASSWORD") || "postgres",
  database: configService.get<string>("DB_NAME") || "adhd_email_client",
  entities: [`${__dirname}/**/*.entity{.ts,.js}`],
  migrations: [`${__dirname}/database/migrations/**/*{.ts,.js}`],
  synchronize: false, // NEVER use synchronize in production - always use migrations
  ssl: !isLocal || sslEnabled ? { rejectUnauthorized: false } : false,
  logging: ["error", "warn", "migration"],
});
