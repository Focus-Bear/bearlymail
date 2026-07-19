/**
 * Imports an ESM-only module from this CommonJS build.
 *
 * Under `tsconfig` `module: "commonjs"`, TypeScript rewrites a plain
 * `await import(x)` into `require(x)` (via `Promise.resolve().then(() =>
 * require(x))`), which throws `ERR_REQUIRE_ESM` for packages that ship only
 * ESM — e.g. pg-boss v12. The `Function` constructor hides the `import()`
 * expression from the TypeScript transform, so a genuine native dynamic import
 * is preserved and the ESM module loads at runtime.
 *
 * Usage:
 *   const { PgBoss } = await esmImport<typeof import("pg-boss")>("pg-boss");
 */
const nativeDynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

export function esmImport<T>(specifier: string): Promise<T> {
  return nativeDynamicImport(specifier) as Promise<T>;
}
