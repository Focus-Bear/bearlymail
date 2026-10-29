/**
 * Bundles the prioritisation Lambda from the `nest build` output.
 *
 * Bundles dist/ (tsc output) rather than src/ because TypeORM reads column
 * types from `emitDecoratorMetadata`, which esbuild does not emit. Run via
 * `npm run build:lambda:prioritisation`; the infra stack deploys
 * dist-lambda/prioritisation as the function asset.
 */
import { build } from "esbuild";
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(SERVER_DIR, "dist/lambda/prioritisation/handler.js");
const OUT_DIR = join(SERVER_DIR, "dist-lambda/prioritisation");
const PROMPTS_SOURCE = join(SERVER_DIR, "promptfoo/prompts");
const NODE_TARGET = "node24";
const IMPORT_META_URL_SHIM = "__bundleImportMetaUrl";

/**
 * Optional peers that TypeORM, NestJS and pg require lazily inside try/catch
 * for drivers and transports this Lambda never uses.
 */
const UNUSED_OPTIONAL_MODULES = [
  "pg-native",
  "pg-query-stream",
  "@nestjs/microservices",
  "@nestjs/microservices/*",
  "@nestjs/websockets",
  "@nestjs/websockets/*",
  "@nestjs/platform-express",
  "class-transformer/storage",
  "@fastify/static",
  "@sap/hana-client",
  "@sap/hana-client/*",
  "better-sqlite3",
  "hdb-pool",
  "ioredis",
  "mongodb",
  "mssql",
  "mysql",
  "mysql2",
  "oracledb",
  "pg-pool-native",
  "react-native-sqlite-storage",
  "redis",
  "sql.js",
  "sqlite3",
  "typeorm-aurora-data-api-driver",
  "@google-cloud/spanner",
];

rmSync(OUT_DIR, { recursive: true, force: true });

await build({
  entryPoints: [ENTRY],
  outfile: join(OUT_DIR, "handler.js"),
  bundle: true,
  platform: "node",
  target: NODE_TARGET,
  format: "cjs",
  // Keep class names: TypeORM and Nest's Logger key off constructor names.
  keepNames: true,
  external: UNUSED_OPTIONAL_MODULES,
  // ESM deps (e.g. @nestjs/typeorm) call createRequire(import.meta.url),
  // which is undefined once bundled to CJS; point it at the bundle itself.
  banner: {
    js: `const ${IMPORT_META_URL_SHIM} = require("node:url").pathToFileURL(__filename).href;`,
  },
  define: { "import.meta.url": IMPORT_META_URL_SHIM },
  logLevel: "info",
});

cpSync(PROMPTS_SOURCE, join(OUT_DIR, "prompts"), { recursive: true });
