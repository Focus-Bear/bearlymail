# Plan: Replace `@typescript-eslint/no-explicit-any` with Proper Types

**Issue:** #72  
**Author:** monk-of-modularity[bot]  
**Date:** 2026-03-23  
**Status:** PLANNING

## Problem Statement

The codebase uses `any` types in multiple locations. While the server production code has been cleaned up (the `@typescript-eslint/no-explicit-any: 'error'` rule is enforced and zero violations exist in non-test server code), significant `any` usage remains in:

1. **Client code** — 307 instances across `client/src/`
2. **Server test code** — 285 instances across `server/src/**/*.spec.ts`

The ESLint config relaxes the rule to `'warn'` for test files, but client code appears to lack strict enforcement.

## Current State (as of 2026-03-23)

### Server Production Code: ✅ Clean

Zero `any` type annotations remain in `server/src/` (excluding `.spec.ts` files). The `@typescript-eslint/no-explicit-any: 'error'` rule is enforced. A `types/common.ts` file provides proper replacement types (e.g., `AuthenticatedRequest`).

### Client Code: 307 instances

**Top offenders by file:**

| File                                | Count | Primary Pattern                     |
| ----------------------------------- | ----- | ----------------------------------- |
| `useEmailDetailInitialization.ts`   | 26    | `as any` casts for state management |
| `InboxContentParts.tsx`             | 20    | Untyped props and event handlers    |
| `useEmailDetailOperations.ts`       | 14    | `as any` for store operations       |
| `EmailDetail.tsx`                   | 13    | `React.FC<any>`, untyped props      |
| `CategorySection.tsx`               | 11    | Untyped drag-and-drop handlers      |
| `useEmailDetailOperations.types.ts` | 8     | Type definition file using `any`    |
| `ContactDetail.tsx`                 | 7     | `contact: any`, untyped props       |
| `InboxContent.tsx`                  | 7     | Untyped callback props              |
| `useSettingsData.ts`                | 6     | Untyped API responses               |
| `EmailDetailDebugPanel.tsx`         | 6     | Debug data types                    |
| `useEmailDetailDraftOps.ts`         | 5     | Draft state management              |
| `useSearch.ts`                      | 4     | Search result typing                |
| `ContactActivityList.tsx`           | 4     | `contact: any` props                |
| `dev-logger.ts`                     | 4     | Logger argument types               |
| `Login.tsx / SetupPassword.tsx`     | 3     | `catch (err: any)`                  |

**Common patterns:**

- `catch (err: any)` → should use `unknown` + type narrowing
- `contact: any` → should define a `Contact` interface
- `React.FC<any>` → should use proper props interface
- `as any` type casts → should use proper generics or type assertions
- `(value: any)` callback params → should type based on usage
- Untyped API responses → should use response DTOs

### Server Test Code: 285 instances

**Top offenders by file:**

| File                                | Count |
| ----------------------------------- | ----- |
| `calendar.service.spec.ts`          | 52    |
| `auto-responder.service.spec.ts`    | 26    |
| `scan-analysis.service.spec.ts`     | 24    |
| `replies.service.spec.ts`           | 20    |
| `resource-monitor.service.spec.ts`  | 19    |
| `queue-autoscaling.service.spec.ts` | 17    |
| `follow-ups.service.spec.ts`        | 16    |
| `waitlist.service.spec.ts`          | 14    |
| `gmail.provider.spec.ts`            | 14    |
| `subscriptions.service.spec.ts`     | 10    |

**Common patterns in tests:**

- `as any` to mock partial objects → should use `Partial<T>` or `jest.Mocked<T>`
- `as any` to access private members → should test through public API or use accessor helpers
- Untyped mock return values → should use `jest.fn<ReturnType, Args>()`

## Proposed Approach

### Phase 1: Client Foundation Types (Low-risk, high-impact)

Create shared type definitions in `client/src/types/`:

```typescript
// client/src/types/contact.ts
interface Contact {
  id: string;
  name: string;
  email: string;
  deals: Deal[];
  customFields: CustomField[];
  // ... based on actual API response shape
}

// client/src/types/email.ts
interface EmailDetailProps {
  emailId: string;
  // ... actual props
}
```

**Files to update:** `ContactDetail.tsx`, `ContactActivityList.tsx`, `ContactDetailHeader.tsx`

### Phase 2: Client Error Handling

Replace all `catch (err: any)` with `catch (err: unknown)` + type narrowing:

```typescript
// Before:
catch (err: any) { setError(err.message); }

// After:
catch (err: unknown) {
  setError(err instanceof Error ? err.message : 'Unknown error');
}
```

**Files:** `Login.tsx`, `SetupPassword.tsx`, `Compose.tsx`, and others with `catch (err: any)`

### Phase 3: Client Component Props

Replace `React.FC<any>` and untyped props with proper interfaces:

**Files:** `EmailDetail.tsx`, `InboxContentParts.tsx`, `CategorySection.tsx`, `InboxContent.tsx`

### Phase 4: Client Hooks & State Management

The biggest cluster — hooks using `as any` for Zustand/Redux state management:

**Files:** `useEmailDetailInitialization.ts`, `useEmailDetailOperations.ts`, `useEmailDetailDraftOps.ts`, `useSearch.ts`, `useSettingsData.ts`

This phase requires understanding the store shape and typing it properly. Most `as any` here are likely working around missing generic parameters on store hooks.

### Phase 5: Client Utility Types

**Files:** `dev-logger.ts` (logger args), `useEmailDetailOperations.types.ts` (type definitions)

### Phase 6: Server Test Cleanup

Lower priority since tests use `'warn'` not `'error'`, but improves maintainability:

1. Replace `as any` mock patterns with `Partial<T>` or `jest.Mocked<T>`
2. Type mock return values properly
3. Use `satisfies` operator where appropriate

**Approach:** Tackle one spec file per PR, starting with the highest-count files.

## Implementation Order

| Phase | Scope                   | Estimated PRs | Priority |
| ----- | ----------------------- | ------------- | -------- |
| 1     | Client foundation types | 1             | High     |
| 2     | Client error handling   | 1             | High     |
| 3     | Client component props  | 2             | Medium   |
| 4     | Client hooks & state    | 2–3           | Medium   |
| 5     | Client utility types    | 1             | Low      |
| 6     | Server test cleanup     | 3–5           | Low      |

Phases 1–2 can ship together as a single PR (~30 instances fixed).
Phases 3–4 are the bulk of the work (~250 instances).
Phase 6 is best done incrementally alongside other test changes.

## Risks & Considerations

- **Client type discovery:** Some `any` types exist because the actual shape is not well-defined (e.g., CRM contact data from external APIs). These may need `unknown` + runtime validation rather than a fixed interface.
- **Store typing cascade:** Fixing hook types may require typing the entire Zustand/Redux store, which could be a large effort.
- **Test disruption:** Removing `as any` from tests may require creating test fixtures/factories, which is good practice but increases scope.
- **No server production work needed:** The server production code is already clean — this was resolved prior to this plan.

## Success Criteria

- [ ] Zero `any` annotations in `client/src/` (or all remaining documented with justification)
- [ ] ESLint `no-explicit-any` set to `'error'` for client code
- [ ] Server test `any` count reduced by ≥50%
- [ ] No type regressions (`tsc --noEmit` passes)
- [ ] No runtime behaviour changes

## Note on Scope Adjustment

The original issue description mentioned "~80+ instances of explicit-any suppressions across the server codebase." Investigation shows the server production code has already been cleaned (0 instances). The remaining work is in client code (307) and server tests (285). The plan has been adjusted accordingly.

---

_Plan authored by monk-of-modularity[bot] 🧘 — "Type safety is not a constraint — it is a compass."_
