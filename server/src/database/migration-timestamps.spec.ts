import * as fs from "fs";
import * as path from "path";

/**
 * TypeORM orders pending migrations by their timestamp prefix; two migrations
 * sharing a timestamp run in an order TypeORM does not guarantee, so a
 * migration can execute before one it depends on — but only on FRESH databases
 * (every existing environment has already applied them in whatever order the
 * current tie-break produced, and renaming an applied migration would make
 * TypeORM treat it as new and re-run it).
 *
 * So: the historical collisions below are frozen as-is, and this spec stops
 * NEW migrations from colliding with each other or with existing ones.
 * When adding a migration, generate it with `npm run migration:generate`
 * (which stamps the current epoch-ms) rather than hand-copying a neighbour's
 * prefix.
 */
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/**
 * Timestamps that already collide in applied history, frozen at their exact
 * historical file counts — do NOT add entries or grow a count.
 */
const FROZEN_DUPLICATE_TIMESTAMP_COUNTS = new Map([
  ["1770200000000", 2],
  ["1770400000000", 2],
  ["1771000000000", 2],
  ["1771200000000", 3],
  ["1771400000000", 2],
  ["1772000000000", 2],
  ["1777000000000", 2],
  ["1779000000000", 2],
  ["1780000000000", 2],
  ["1786000000000", 2],
  ["1790300000000", 2],
  ["1790500000000", 2],
  ["1794300000000", 3],
  ["1794400000000", 3],
  ["1794500000000", 2],
]);

/** Reads the migrations dir and counts files per timestamp prefix. */
function countMigrationTimestamps(): Map<string, number> {
  const counts = new Map<string, number>();
  const timestamps = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+-.*\.ts$/.test(file))
    .map((file) => file.split("-")[0]);
  for (const timestamp of timestamps) {
    counts.set(timestamp, (counts.get(timestamp) ?? 0) + 1);
  }
  return counts;
}

describe("migration timestamp uniqueness", () => {
  // Filesystem access stays inside the tests (not describe evaluation), so a
  // missing/inaccessible dir fails these tests instead of the whole runner.
  it("no NEW duplicate timestamps beyond the frozen historical set", () => {
    const counts = countMigrationTimestamps();
    const newCollisions = [...counts.entries()]
      .filter(
        ([timestamp, count]) =>
          count > 1 && !FROZEN_DUPLICATE_TIMESTAMP_COUNTS.has(timestamp),
      )
      .map(([timestamp, count]) => `${timestamp} (${count} files)`);

    expect(newCollisions).toEqual([]);
  });

  it("frozen collisions have not grown (nothing added onto an existing duplicate timestamp)", () => {
    // Each frozen timestamp is pinned at its historical file count; adding
    // another file onto a frozen group would still create nondeterministic
    // ordering for fresh databases.
    const counts = countMigrationTimestamps();
    const grown = [...FROZEN_DUPLICATE_TIMESTAMP_COUNTS.entries()].filter(
      ([timestamp, frozenCount]) => (counts.get(timestamp) ?? 0) > frozenCount,
    );
    expect(grown).toEqual([]);
  });
});
