#!/usr/bin/env node
/**
 * One-command local runner: `npm run local`
 *
 * Boots an embedded PostgreSQL 17 (no Docker needed), generates and persists
 * local secrets, runs migrations, seeds a login user, then starts the API
 * server, background worker, and Vite client together. Designed for the
 * fully-local Apple Mail + Claude Code CLI mode, but works for any local dev.
 *
 * State lives in .localdata/ (gitignored):
 *   .localdata/pg/        embedded Postgres data directory
 *   .localdata/local.env  generated secrets + login credentials (stable across runs)
 *
 * Flags:
 *   --reset   wipe .localdata (database and secrets) and start fresh
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import concurrently from 'concurrently';
import EmbeddedPostgres from 'embedded-postgres';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const serverDir = join(repoRoot, 'server');
const clientDir = join(repoRoot, 'client');
const dataDir = join(repoRoot, '.localdata');
const pgDataDir = join(dataDir, 'pg');
const localEnvPath = join(dataDir, 'local.env');

const DB_NAME = 'adhd_email_client';
const DB_USER = 'postgres';
const DB_PASSWORD = 'postgres';
// 5433 (not 5432) so an existing Docker/Homebrew Postgres doesn't collide.
const DEFAULT_DB_PORT = 5433;
const PORT_SCAN_RANGE = 20;

const log = (msg) => console.log(`\x1b[36m[local]\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\x1b[31m[local] ${msg}\x1b[0m`);
  process.exit(1);
};

if (process.argv.includes('--reset')) {
  log('Removing .localdata (database + secrets)...');
  rmSync(dataDir, { recursive: true, force: true });
}

// ── 1. Dependencies ──────────────────────────────────────────────────────────

const missingDeps = [repoRoot, serverDir, clientDir].filter(
  (dir) => !existsSync(join(dir, 'node_modules')),
);
if (missingDeps.length > 0) {
  log('Installing dependencies (first run only, this takes a few minutes)...');
  const install = spawnSync('npm', ['run', 'install-all'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (install.status !== 0) fail('npm run install-all failed');
}

// ── 2. Secrets (generated once, then reused) ─────────────────────────────────

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('=') && !line.startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
  );
}

mkdirSync(dataDir, { recursive: true });
const secrets = loadEnvFile(localEnvPath);
secrets.ENCRYPTION_KEY ||= randomBytes(32).toString('hex');
secrets.JWT_SECRET ||= randomBytes(32).toString('hex');
secrets.LOCAL_USER_EMAIL ||= 'local@bearlymail.local';
secrets.LOCAL_USER_PASSWORD ||= randomBytes(9).toString('base64url');
writeFileSync(
  localEnvPath,
  Object.entries(secrets)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
);

// ── 3. Embedded PostgreSQL ───────────────────────────────────────────────────

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Port our own cluster is currently listening on, if it is running. */
function runningClusterPort() {
  try {
    // postmaster.pid line 4 is the port (see PostgreSQL docs).
    const port = Number(readFileSync(join(pgDataDir, 'postmaster.pid'), 'utf8').split('\n')[3]);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

async function pickDbPort() {
  if (process.env.BEARLYMAIL_LOCAL_PG_PORT) {
    return Number(process.env.BEARLYMAIL_LOCAL_PG_PORT);
  }
  const existing = runningClusterPort();
  if (existing && (await isPortOpen(existing))) return existing;
  for (let port = DEFAULT_DB_PORT; port < DEFAULT_DB_PORT + PORT_SCAN_RANGE; port++) {
    if (!(await isPortOpen(port))) return port;
  }
  fail(`No free port found in ${DEFAULT_DB_PORT}-${DEFAULT_DB_PORT + PORT_SCAN_RANGE - 1}`);
}

const DB_PORT = await pickDbPort();

// Values here are defaults: anything already exported in your shell (or set in
// server/.env, which Nest still loads) wins, except the DB_* connection which
// must point at the embedded Postgres this script manages.
const childEnv = {
  NODE_ENV: 'development',
  PORT: '3001',
  FRONTEND_URL: 'http://localhost:3000',
  LLM_PROVIDER: 'claude-cli',
  // Self-hosters never see plan limits, trials, or AI-capacity 402s.
  SELF_HOSTED: 'true',
  ENCRYPTION_KEY: secrets.ENCRYPTION_KEY,
  JWT_SECRET: secrets.JWT_SECRET,
  LOCAL_USER_EMAIL: secrets.LOCAL_USER_EMAIL,
  LOCAL_USER_PASSWORD: secrets.LOCAL_USER_PASSWORD,
  ...process.env,
  DB_HOST: 'localhost',
  DB_PORT: String(DB_PORT),
  DB_USERNAME: DB_USER,
  DB_PASSWORD: DB_PASSWORD,
  DB_NAME,
  DB_SSL: 'false',
};

const pg = new EmbeddedPostgres({
  databaseDir: pgDataDir,
  user: DB_USER,
  password: DB_PASSWORD,
  port: DB_PORT,
  persistent: true,
  onLog: () => {},
});

/** Major version of the PostgreSQL server bundled with the installed embedded-postgres. */
function bundledPgMajor() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, 'node_modules', 'embedded-postgres', 'package.json'), 'utf8'),
    );
    return pkg.version.split('.')[0];
  } catch {
    return null;
  }
}

let startedPostgres = false;
const clusterExists = existsSync(join(pgDataDir, 'PG_VERSION'));
const bundledMajor = bundledPgMajor();
if (await isPortOpen(DB_PORT)) {
  if (clusterExists && runningClusterPort() === DB_PORT) {
    log(`Reusing local Postgres already running on port ${DB_PORT}`);
  } else {
    fail(
      `Port ${DB_PORT} is in use by another process. Stop it, or pick another port with BEARLYMAIL_LOCAL_PG_PORT=<port> npm run local`,
    );
  }
} else {
  if (clusterExists && bundledMajor) {
    // A data directory only works with the PostgreSQL major that created it;
    // pg.start() would otherwise die with its FATAL log swallowed by onLog.
    let clusterMajor = null;
    try {
      clusterMajor = readFileSync(join(pgDataDir, 'PG_VERSION'), 'utf8').trim();
    } catch {
      // Unreadable PG_VERSION: skip the guard and let pg.start() report it.
    }
    if (clusterMajor && clusterMajor !== bundledMajor) {
      fail(
        `Your local database (.localdata/pg) was created by PostgreSQL ${clusterMajor}, but the installed embedded-postgres bundles PostgreSQL ${bundledMajor}, which cannot open it.\n` +
          `       Either start fresh with: npm run local -- --reset  (wipes local emails and login)\n` +
          `       or pin embedded-postgres back to ^${clusterMajor} in package.json and npm install.`,
      );
    }
  }
  if (!clusterExists) {
    log(`Initialising embedded PostgreSQL${bundledMajor ? ` ${bundledMajor}` : ''} (first run only)...`);
    await pg.initialise();
  } else if (existsSync(join(pgDataDir, 'postmaster.pid'))) {
    // Nothing is listening, so this pid file is left over from a crash.
    rmSync(join(pgDataDir, 'postmaster.pid'), { force: true });
  }
  log(`Starting embedded PostgreSQL on port ${DB_PORT}...`);
  await pg.start();
  startedPostgres = true;
}

/**
 * SIGTERMs pid and all of its descendants (children first). npm scripts nest
 * several processes deep (npm → nest → node), and signalling only the direct
 * child would orphan the rest.
 */
function killTree(pid) {
  const children = (spawnSync('pgrep', ['-P', String(pid)]).stdout?.toString() ?? '')
    .split('\n')
    .filter(Boolean);
  for (const child of children) killTree(Number(child));
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already exited
  }
}

let shuttingDown = false;
let runningCommands = [];
async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  // Ctrl+C already signals the whole process group, but a plain SIGTERM to
  // this process would otherwise orphan the app processes.
  for (const command of runningCommands) {
    if (command.pid) killTree(command.pid);
  }
  if (runningCommands.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (startedPostgres) {
    log('Stopping embedded PostgreSQL...');
    await pg.stop().catch(() => {});
  }
  process.exit(exitCode);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  await pg.createDatabase(DB_NAME);
  log(`Created database ${DB_NAME}`);
} catch (error) {
  if (!String(error).includes('already exists')) {
    await shutdown(1);
  }
}

// ── 4. Migrations + seed user ────────────────────────────────────────────────

async function runStep(label, command, args, cwd) {
  log(label);
  const result = spawnSync(command, args, { cwd, env: childEnv, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\x1b[31m[local] ${label} failed\x1b[0m`);
    await shutdown(1);
  }
}

await runStep('Running database migrations...', 'npm', ['run', 'migration:run'], serverDir);
await runStep('Seeding local login user...', 'npm', ['run', 'seed:local-user'], serverDir);

// ── 5. Preflight warnings ────────────────────────────────────────────────────

if (childEnv.LLM_PROVIDER === 'claude-cli') {
  try {
    execFileSync(childEnv.CLAUDE_CLI_PATH || 'claude', ['--version'], { stdio: 'pipe' });
  } catch {
    console.warn(
      '\x1b[33m[local] Claude Code CLI not found — LLM features (priorities, summaries, replies) will degrade to rule-based behaviour.\n' +
        '        Install with: npm install -g @anthropic-ai/claude-code && claude  (to log in)\x1b[0m',
    );
  }
}

// Fail fast on occupied app ports: Vite would silently hop to another port
// (often 3001) and knock over the API server in a confusing cascade.
for (const [port, what] of [
  [3000, 'the web client'],
  [3001, 'the API server'],
]) {
  if (await isPortOpen(port)) {
    console.error(
      `\x1b[31m[local] Port ${port} (needed for ${what}) is already in use — is another BearlyMail dev instance running?\x1b[0m`,
    );
    await shutdown(1);
  }
}

// ── 6. Start everything ──────────────────────────────────────────────────────

console.log(`
\x1b[1m  BearlyMail is starting — everything runs on this machine.\x1b[0m

    App:       http://localhost:3000
    API:       http://localhost:3001
    Login:     ${secrets.LOCAL_USER_EMAIL}
    Password:  ${secrets.LOCAL_USER_PASSWORD}

  Next steps once the app opens:
    1. Log in with the credentials above.
    2. Settings → Email accounts → Connect Another → Apple Mail.
    3. Allow the macOS "wants to control Mail" automation prompt.

  Credentials are saved in .localdata/local.env. Stop with Ctrl+C.
  Start over with: npm run local -- --reset
`);

// The worker runs from the compiled dist that `nest start --watch` produces
// (running worker.ts via ts-node hits a TypeScript emit crash — see
// `npm run worker`). Waiting for /health guarantees the build has finished.
const workerCommand =
  'sh -c \'echo "waiting for the server build..."; ' +
  'until curl -sf http://localhost:3001/health >/dev/null 2>&1; do sleep 2; done; ' +
  'if [ -f dist/worker.js ]; then exec node dist/worker.js; else exec node dist/src/worker.js; fi\'';

const { result, commands } = concurrently(
  [
    { command: 'node dist/main.js', name: 'server', cwd: serverDir, env: childEnv, prefixColor: 'blue' },
    { command: workerCommand, name: 'worker', cwd: serverDir, env: childEnv, prefixColor: 'magenta' },
    { command: 'npm start', name: 'client', cwd: clientDir, env: childEnv, prefixColor: 'green' },
  ],
  { killOthersOn: ['failure', 'success'], prefix: 'name' },
);
runningCommands = commands;

result.then(
  () => shutdown(0),
  () => shutdown(1),
);
