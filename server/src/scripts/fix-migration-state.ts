import { config } from "dotenv";
import * as path from "path";
import { DataSource } from "typeorm";

// Load environment variables
config({ path: path.join(__dirname, "../../.env") });

const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "adhd_email_client",
  // nosemgrep
  ssl:
    (process.env.DB_HOST !== "localhost" &&
      process.env.DB_HOST !== "127.0.0.1") ||
    process.env.DB_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,
});

async function fixMigrationState() {
  try {
    await dataSource.initialize();

    console.log("Connected to database");

    // Remove the InitialSchema migration record so it can be re-run
    await dataSource.query(
      `DELETE FROM migrations WHERE name = 'InitialSchema1735271999999'`,
    );

    console.log("Removed InitialSchema migration record from migrations table");

    console.log("You can now run: npm run migration:run");

    await dataSource.destroy();
  } catch (error: unknown) {
    const isErr = error instanceof Error;
    const errorMessage = isErr ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    if (
      isErr &&
      error.message?.includes('relation "migrations" does not exist')
    ) {
      console.log(
        "Migrations table does not exist - this is fine, migrations will create it",
      );

      console.log("You can run: npm run migration:run");
    }
    process.exit(1);
  }
}

fixMigrationState();
