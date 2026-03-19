# Plan: Fix #788 — DB Connection Pool Exhaustion (PostHog: RDS max connections reached)

**Branch:** `plan/788-db-connection-pool-exhaustion`  
**Author:** Monk of Modularity (AI agent), subagent of Laoban  
**Priority:** P1 — intermittent production outages under load  
**Linked issue:** #788  

---

## Root Cause Analysis

### 1. Connection Pool Accounting

Two separate pg connection pools are created per process:
- **TypeORM pool**: `DB_POOL_SIZE` env var, default `10` (`extra.max` in `typeorm-config.factory.ts`)
- **PgBoss pool**: `DB_PGBOSS_POOL_SIZE` env var, default `10` (`max:` in `queue.module.ts`)

With the deployment config:
- **Web instances**: scale min 1 → max **3** (each with TypeORM + PgBoss pools)
- **Worker instance**: 1 (TypeORM + PgBoss pools)

**Peak connection count at max scale:**  
`(3 web + 1 worker) × (10 TypeORM + 10 PgBoss) = 80 connections`

**RDS t4g.micro max_connections** (PostgreSQL 17 formula):  
`LEAST(DBInstanceClassMemory / 9531392, 5000)`  
For 1 GB RAM: `1073741824 / 9531392 ≈ 112 connections`

At 80 out of 112 (71%), the pool is uncomfortably close to the limit. Under any transient load spike (connection acquisition bursts during mass email processing), it can exceed the ceiling, producing "FATAL: remaining connection slots are reserved" errors.

---

### 2. Resource Monitor Bug

**File:** `server/src/queue/resource-monitor.service.ts` — `collectMetrics()` method

```typescript
// BUG: CPU_CRITICAL is 80 (percent), but totalConnections is an absolute count, not a percent
if (dbMetrics.totalConnections > RESOURCE_MONITOR_CONSTANTS.CPU_CRITICAL) {
  this.logger.warn(
    `⚠️ High database connections: ${dbMetrics.totalConnections} total, ...`
  );
}
```

This compares an **absolute connection count** against `CPU_CRITICAL = 80` — a CPU **percentage** constant. The check accidentally works (warns above 80 connections) but is semantically incorrect and uses the wrong constant. If `CPU_CRITICAL` were changed for CPU monitoring purposes, the DB alerting threshold would silently change too.

---

### 3. No Environment Validation for Pool Size Vars

`server/src/config/env.validation.ts` does not validate or default `DB_POOL_SIZE` or `DB_PGBOSS_POOL_SIZE`. If these are missing from production env (or set to very large values), the app silently uses defaults (10+10=20 per process) or any arbitrary number with no startup-time guardrails.

---

### 4. No PgBouncer / Connection Proxy

All instances connect directly to RDS with persistent pg pools. There is no connection pooler (PgBouncer) in front of RDS to multiplex connections from multiple app instances. At 3 web instances + 1 worker, each holding 20 connections, the DB is fully responsible for managing all 80 simultaneous client connections.

---

## Files to Change

### 1. `server/src/constants/resource-monitor-constants.ts`

Add dedicated DB connection warning thresholds:

```typescript
export const RESOURCE_MONITOR_CONSTANTS = {
  // ... existing ...
  // Database connection thresholds (absolute counts, not percentages)
  // Tune based on RDS instance's max_connections limit
  // t4g.micro (1GB RAM): max_connections ≈ 112; warn at 80%, critical at 90%
  DB_CONNECTIONS_WARNING: 90,    // warn when > 90 connections
  DB_CONNECTIONS_CRITICAL: 100,  // critical when > 100 connections
} as const;
```

---

### 2. `server/src/queue/resource-monitor.service.ts`

Fix the threshold comparison bug and add separate warning/critical levels:

```typescript
// BEFORE (bug: uses CPU_CRITICAL for a connection count comparison):
if (dbMetrics.totalConnections > RESOURCE_MONITOR_CONSTANTS.CPU_CRITICAL) {

// AFTER:
if (dbMetrics.totalConnections > RESOURCE_MONITOR_CONSTANTS.DB_CONNECTIONS_CRITICAL) {
  this.logger.error(
    `🔴 CRITICAL database connections: ${dbMetrics.totalConnections} total (limit: ~112 on t4g.micro). RDS may reject new connections.`,
  );
} else if (dbMetrics.totalConnections > RESOURCE_MONITOR_CONSTANTS.DB_CONNECTIONS_WARNING) {
  this.logger.warn(
    `⚠️ High database connections: ${dbMetrics.totalConnections} total, ${dbMetrics.activeConnections} active`,
  );
}
```

---

### 3. `server/src/config/env.validation.ts`

Add pool size env var validation with sane maximums to prevent accidental misconfiguration:

```typescript
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

export class EnvironmentVariables {
  // ... existing ...

  /**
   * TypeORM connection pool size per process.
   * Default 10. Keep (web_instances × DB_POOL_SIZE) + (worker_instances × DB_POOL_SIZE) well below
   * your RDS max_connections (≈112 for t4g.micro, ≈256 for t4g.small).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  DB_POOL_SIZE?: number;

  /**
   * PgBoss pg.Pool size per process (separate from TypeORM pool).
   * Defaults to 10 if not set. Count: same math as DB_POOL_SIZE above.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  DB_PGBOSS_POOL_SIZE?: number;
}
```

---

### 4. `server/src/database/typeorm-config.factory.ts`

Reduce the default pool sizes to safer values for the current deployment topology, and add a min=0 (release idle connections immediately):

```typescript
// BEFORE:
const poolSize = parseInt(
  configService.get<string>("DB_POOL_SIZE") || "10",
  10,
);
// ...
extra: {
  max: poolSize,
  min: 2,  // ← always holds 2 open connections even when idle
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
},

// AFTER:
const poolSize = parseInt(
  configService.get<string>("DB_POOL_SIZE") || "5",  // Safer default: 4 processes × 5 = 20
  10,
);
// ...
extra: {
  max: poolSize,
  min: 0,  // ← release idle connections to free up RDS slots
  idleTimeoutMillis: 10000,        // Reduced: release idle connections after 10s
  connectionTimeoutMillis: 5000,
},
```

> **Note for Codebeard:** `min: 0` means new connections incur a ~2ms setup cost after idle periods. This is acceptable for our use case — the TypeORM pool will still warm up quickly on first request. If latency becomes a concern, restore `min: 1`.

---

### 5. `server/src/queue/queue.module.ts`

Reduce PgBoss default pool size to match TypeORM default reduction:

```typescript
// BEFORE:
const pgBossPoolSize = parseInt(
  configService.get<string>("DB_PGBOSS_POOL_SIZE") || "10",
  10,
);

// AFTER:
const pgBossPoolSize = parseInt(
  configService.get<string>("DB_PGBOSS_POOL_SIZE") || "5",  // Safer default
  10,
);
```

Also add PgBoss idle connection timeout configuration (PgBoss uses `pg.Pool` under the hood, which respects `idleTimeoutMillis`):

```typescript
const boss = new PgBoss({
  // ...existing...
  max: pgBossPoolSize,
  idleTimeoutMillis: 15000,   // ← ADD: release idle connections after 15s
  connectionTimeoutMillis: 5000,
});
```

---

### 6. `koyeb.yaml`

Add recommended env var defaults as comments to document the connection budget:

```yaml
services:
  - name: adhd-email-client-api
    # ...
    env:
      # ...existing...
      # DB connection pool (tune based on RDS max_connections):
      # t4g.micro (1GB): max_connections ≈ 112
      # Budget: (max_web_instances + worker_instances) × (DB_POOL_SIZE + DB_PGBOSS_POOL_SIZE) < 80% of max_connections
      # With max 3 web + 1 worker: 4 × (5+5) = 40 connections (36% of 112) ← safe
      - key: DB_POOL_SIZE
        value: "5"
      - key: DB_PGBOSS_POOL_SIZE
        value: "5"
```

---

## Connection Budget Summary (After Fix)

| Scenario | Connections |
|---|---|
| Current (3 web + 1 worker, defaults 10+10) | **80 connections** (71% of 112) |
| Fixed (3 web + 1 worker, new defaults 5+5) | **40 connections** (36% of 112) |
| Fixed with min:0 (idle) | 0 idle, up to 40 active |
| RDS t4g.micro max_connections | 112 |

---

## Optional Future Work (Not in This PR)

1. **PgBouncer**: Add a PgBouncer sidecar to multiplex app connections. This would allow each process to hold many pool connections while only using a fraction of RDS connections. Significant operational complexity for the current scale.

2. **CloudWatch alarm**: Add a CloudWatch alarm on `DatabaseConnections` RDS metric to alert before the limit is reached. This is infrastructure-level and tracked in the CDK stack.

3. **RDS instance upgrade**: Upgrade from t4g.micro to t4g.small (2GB RAM → max_connections ≈ 225) if user growth warrants it.

---

## Testing

- Unit test the `env.validation.ts` changes: ensure invalid pool sizes (0, 51, non-integer) are rejected at startup
- Load test: verify that under concurrent job processing, connections peak below `DB_CONNECTIONS_WARNING` threshold
- Manual: deploy with `DB_POOL_SIZE=5` and `DB_PGBOSS_POOL_SIZE=5`, monitor `pg_stat_activity` during peak processing

---

Closes #788
