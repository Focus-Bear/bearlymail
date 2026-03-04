# Plan: Add ESLint Auto-Fix Import Ordering Rule (Issue #646)

## Problem Statement

Imports across the codebase are inconsistently ordered, making diffs noisier and code harder
to scan. Issue #646 requests an auto-fixable ESLint rule for alphabetical import ordering.

### Current State (surveyed 2026-03-04)

| Area   | Files with multiple imports | Files with unsorted imports | % unsorted |
|--------|----------------------------|-----------------------------|------------|
| client | 491                        | 410                         | **83.5%**  |
| server | 311                        | 299                         | **96.1%**  |

---

## Recommended Plugin: `eslint-plugin-simple-import-sort`

### Why `simple-import-sort` over `import/order`?

| Criterion | `eslint-plugin-simple-import-sort` | `eslint-plugin-import` (`import/order`) |
|-----------|------------------------------------|-----------------------------------------|
| Auto-fixable | ✅ Always | ⚠️ Partial |
| TypeScript path-alias aware | ✅ Works out of box | Requires `eslint-import-resolver-typescript` |
| Handles type imports (`import type`) | ✅ Natively | Requires extra config |
| Config complexity | ✅ Minimal | Moderate to complex |
| Bundle size | ✅ Tiny (single purpose) | Large (many rules) |

### What the rule produces

Imports are sorted into logical groups separated by blank lines:

```
// Group 1: Side-effect imports (e.g. import 'reflect-metadata')
// Group 2: External packages (e.g. react, @nestjs/*, axios)
// Group 3: Internal/path-alias imports (e.g. contexts/*, components/*, hooks/*)
// Group 4: Relative imports (e.g. ./foo, ../bar) — discouraged in client but present in server
```

Within each group, imports are alphabetically sorted by module path, then by specifier name.

---

## Implementation Plan

### Step 1: Install the plugin

**Client:**
```bash
cd client
npm install --save-dev eslint-plugin-simple-import-sort
```

**Server:**
```bash
cd server
npm install --save-dev eslint-plugin-simple-import-sort
```

---

### Step 2: Update `client/.eslintrc.js`

Add `simple-import-sort` to the `plugins` array and add two rules:

```diff
 module.exports = {
   extends: ['react-app', 'react-app/jest'],
-  plugins: ['i18next'],
+  plugins: ['i18next', 'simple-import-sort'],
   rules: {
+    // ===========================================
+    // IMPORT ORDERING
+    // ===========================================
+    // Auto-sortable alphabetical import groups (run: npm run lint:fix)
+    'simple-import-sort/imports': [
+      'error',
+      {
+        groups: [
+          // Side-effect imports
+          ['^\\u0000'],
+          // External packages: react first, then @-scoped, then others
+          ['^react', '^@?\\w'],
+          // Internal path-alias imports (src/ root folders used as aliases)
+          [
+            '^(components|config|constants|contexts|hooks|pages|store|stories|locales)(/.*|$)',
+          ],
+          // Relative imports
+          ['^\\.'],
+        ],
+      },
+    ],
+    'simple-import-sort/exports': 'error',
+
     // === existing rules below ===
```

> **Note on path aliases:** The client uses `vite-tsconfig-paths` with a wildcard `"*": ["*"]`
> in `tsconfig.json`, making all `src/` sub-directories available as bare imports (e.g.,
> `contexts/AuthContext`). The custom group regex above ensures these are treated as *internal*
> (group 3) rather than external packages (group 2), keeping them visually separated.

---

### Step 3: Update `server/.eslintrc.js`

```diff
 module.exports = {
   parser: '@typescript-eslint/parser',
   parserOptions: { ... },
-  plugins: ['@typescript-eslint/eslint-plugin'],
+  plugins: ['@typescript-eslint/eslint-plugin', 'simple-import-sort'],
   extends: [
     'plugin:@typescript-eslint/recommended',
     'plugin:prettier/recommended',
   ],
   rules: {
+    // ===========================================
+    // IMPORT ORDERING
+    // ===========================================
+    'simple-import-sort/imports': [
+      'error',
+      {
+        groups: [
+          // Side-effect imports (e.g. import 'reflect-metadata')
+          ['^\\u0000'],
+          // External packages: NestJS first, then @-scoped, then others
+          ['^@nestjs', '^@?\\w'],
+          // Relative imports (server has no path aliases)
+          ['^\\.'],
+        ],
+      },
+    ],
+    'simple-import-sort/exports': 'error',
+
     // === existing rules below ===
```

> **Note:** The server's `tsconfig.json` has no `paths` configuration, so all non-relative
> imports are genuinely external. No custom group for internal aliases is needed here.

---

### Step 4: Auto-fix all existing files

Run once to sort all existing imports. This is safe — the rule is purely cosmetic and
does not change runtime behaviour.

**Client:**
```bash
cd client
npx eslint --fix src/ --rule 'simple-import-sort/imports: error' --rule 'simple-import-sort/exports: error'
# Or simply:
npm run lint:fix
```

**Server:**
```bash
cd server
npx eslint --fix "{src,apps,libs,test}/**/*.ts"
# Or:
npm run lint
```

Expected diff: ~700 files changed, only import order lines rearranged.

---

## Edge Cases & Gotchas

### 1. `import 'reflect-metadata'` (server)
NestJS requires `reflect-metadata` as the very first import in `main.ts`. The side-effect
group (`^\\u0000`) ensures bare/side-effect imports always sort to the top.

### 2. Client path aliases (`contexts/`, `hooks/`, `components/`, etc.)
Without the custom group regex, `simple-import-sort` would treat `contexts/AuthContext` as
an external package (no leading `./`). The regex group in Step 2 fixes this.

### 3. `import type` statements
`simple-import-sort` handles TypeScript's `import type { Foo }` natively — they sort
alongside regular imports from the same module, which is the most readable behaviour.

### 4. Prettier compatibility (server)
The server uses `eslint-plugin-prettier`. `simple-import-sort` outputs sorted imports
that are already prettier-compatible (single quotes, no trailing commas in import lists).
No conflict expected.

### 5. Storybook story files (client)
The existing `overrides` block already disables strict rules for `*.stories.tsx`. Import
ordering can optionally be disabled there too if story authors prefer freeform imports:
```js
'simple-import-sort/imports': 'off',
'simple-import-sort/exports': 'off',
```

### 6. CI enforcement
After the auto-fix commit, CI (`npm run lint`) will enforce ordering on all future PRs
with zero tolerance (`--max-warnings=0` is already set on the server).

---

## Rollout Order

1. ✅ Install plugin (both workspaces)
2. ✅ Update `.eslintrc.js` (both workspaces)
3. ✅ Run auto-fix (both workspaces, one commit per workspace for clean history)
4. ✅ Verify CI passes
5. ✅ Update `CLAUDE.md` / contributor docs noting import ordering is enforced

---

## Files to Change

| File | Change |
|------|--------|
| `client/package.json` | Add `eslint-plugin-simple-import-sort` to `devDependencies` |
| `client/package-lock.json` | Updated by npm |
| `client/.eslintrc.js` | Add plugin + rules (see Step 2) |
| `server/package.json` | Add `eslint-plugin-simple-import-sort` to `devDependencies` |
| `server/package-lock.json` | Updated by npm |
| `server/.eslintrc.js` | Add plugin + rules (see Step 3) |
| `client/src/**/*.ts(x)` | ~410 files auto-fixed (import order only) |
| `server/src/**/*.ts` | ~299 files auto-fixed (import order only) |

---

*Plan authored by [Monk of Modularity] — keeping modules tidy, one import at a time.*
