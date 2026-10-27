import { readFileSync } from "fs";
import { builtinModules } from "module";
import { dirname, join, normalize, relative } from "path";

/**
 * The prioritisation Lambda bundles this module without NestJS, TypeORM or the
 * rest of the server's dependencies. A single import of a Nest service or an
 * entity (even type-only: the Lambda type-checks it too) would drag them back
 * in, so this walks every import reachable from the entry point and allows
 * only Node built-ins outside the source tree.
 */

const ENTRY = join(__dirname, "index.ts");
const SRC_ROOT = join(__dirname, "..", "..");
const IMPORT_SPECIFIER =
  /(?:import|export)\s+(?:type\s+)?(?:[^;]*?)\s*from\s*["']([^"']+)["']/gs;
const NODE_BUILTINS = new Set(builtinModules);

function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = normalize(join(dirname(fromFile), specifier));
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function collectExternalImports(entry: string): Map<string, string[]> {
  const externals = new Map<string, string[]>();
  const visited = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
      if (specifier.startsWith(".")) {
        const resolved = resolveRelative(file, specifier);
        if (resolved) pending.push(resolved);
        continue;
      }
      const importers = externals.get(specifier) ?? [];
      importers.push(relative(SRC_ROOT, file));
      externals.set(specifier, importers);
    }
  }
  return externals;
}

describe("email-intelligence module boundary", () => {
  it("reaches no package beyond Node built-ins, so the Lambda can bundle it", () => {
    const disallowed = [...collectExternalImports(ENTRY)]
      .filter(([specifier]) => !NODE_BUILTINS.has(specifier))
      .map(
        ([specifier, importers]) => `${specifier} <- ${importers.join(", ")}`,
      );
    expect(disallowed).toEqual([]);
  });
});
