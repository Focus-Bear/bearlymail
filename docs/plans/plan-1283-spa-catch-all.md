# Plan: Fix SPA Catch-All Returning HTTP 404 (#1283)

**Issue:** #1283 — All SPA routes return HTTP 404 from server (SPA catch-all missing)
**Status:** Confirmed by Professor Reproducible
**Author:** Monk of Modularity (AI agent)

## Problem

All client-side SPA routes (e.g., `/inbox`, `/settings`, `/login`) return HTTP 404 status when accessed directly via URL, curl, or bots. This breaks:

- SEO crawlers and link previews (bots see 404)
- `curl`/`wget` health checks
- Any non-JS client accessing SPA routes
- Browser preloading hints

## Root Cause Analysis

### Current Implementation

**File:** `infrastructure/lib/bearlymail-stack.ts` (lines 628-648 and 683-698)

The CloudFront distribution has `errorResponses` configured for both the custom-domain and non-custom-domain branches:

```typescript
errorResponses: [
  {
    httpStatus: 403,
    responseHttpStatus: 404,    // ← Problem: returns 404
    responsePagePath: '/404.html', // ← Problem: serves 404.html, not index.html
    ttl: cdk.Duration.seconds(0),
  },
  {
    httpStatus: 404,
    responseHttpStatus: 404,    // ← Problem: returns 404
    responsePagePath: '/404.html', // ← Problem: serves 404.html, not index.html
    ttl: cdk.Duration.seconds(0),
  },
],
```

**File:** `client/public/404.html`

A JavaScript-based workaround exists in `404.html`:

```javascript
if (!/\.(js|css|png|...)$/i.test(window.location.pathname)) {
  sessionStorage.setItem(
    "spa-redirect",
    window.location.pathname + window.location.search,
  );
  window.location.replace("/");
}
```

This workaround only works for browser clients with JavaScript enabled. It fails for:

- `curl`, `wget`, API clients → see HTTP 404 + HTML body
- Search engine bots → index pages as 404 (bad SEO)
- Social media link preview bots → no preview generated
- Users with JavaScript disabled

### The Standard SPA Fix

The standard approach for SPAs on CloudFront is to serve `index.html` with HTTP 200 for all routes that don't match a static file. CloudFront's `errorResponses` can do this by:

1. Changing `responseHttpStatus` from `404` to `200`
2. Changing `responsePagePath` from `/404.html` to `/index.html`

This way, React Router handles all routing client-side, and the HTTP status is always 200 for valid SPA routes.

## Implementation Plan

### Step 1: Update CloudFront Error Responses

**File:** `infrastructure/lib/bearlymail-stack.ts`

There are **two** CloudFront distribution definitions (one with custom domain ~line 634, one without ~line 684). Both need the same fix.

For each `errorResponses` array, change:

```typescript
// BEFORE (both entries):
{
  httpStatus: 403, // or 404
  responseHttpStatus: 404,
  responsePagePath: '/404.html',
  ttl: cdk.Duration.seconds(0),
}

// AFTER (both entries):
{
  httpStatus: 403, // or 404
  responseHttpStatus: 200,
  responsePagePath: '/index.html',
  ttl: cdk.Duration.seconds(0),
}
```

Total changes: 4 lines modified across 2 distribution configs (2 entries each).

### Step 2: Update Comments

**File:** `infrastructure/lib/bearlymail-stack.ts`

Update the comments above each `errorResponses` block to reflect the new approach:

```typescript
// SPA routing: serve index.html with 200 for all routes.
// React Router handles client-side routing.
// Actual 404s for missing assets are handled by the app.
```

### Step 3: Clean Up 404.html (Optional but Recommended)

**File:** `client/public/404.html`

The JS redirect workaround in `404.html` is no longer needed once CloudFront serves `index.html` with 200. However, keep `404.html` as a simple fallback page (without the redirect script) in case it's ever needed.

Simplify to:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Page Not Found</title>
  </head>
  <body>
    <p>Not found</p>
  </body>
</html>
```

### Step 4: Verify Asset 404s Still Work

After this change, requests for truly missing assets (e.g., `/assets/missing.js`) will also get `index.html` with 200. This is standard SPA behavior — the browser will fail to parse HTML as JavaScript, and the React app's catch-all route should show a proper 404 page for unknown routes.

Ensure `client/src/App.tsx` has a catch-all route:

```typescript
<Route path="*" element={<NotFound />} />
```

(Check if this already exists; if not, add it.)

## Files to Modify

| File                                     | Action                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `infrastructure/lib/bearlymail-stack.ts` | Change `responseHttpStatus: 404` → `200` and `responsePagePath: '/404.html'` → `'/index.html'` in both distribution configs (4 lines) |
| `client/public/404.html`                 | Remove JS redirect workaround (optional cleanup)                                                                                      |
| `client/src/App.tsx`                     | Verify catch-all route exists; add if missing                                                                                         |

## Risk Assessment

**Low risk.** This is a standard, well-documented SPA hosting pattern for CloudFront. The only consideration is that truly missing asset requests will now return 200 + HTML instead of 404, but this is expected behavior for SPAs and doesn't cause issues in practice (browsers won't execute HTML as JS/CSS).

## Estimated Complexity

**Low** — 4 lines changed in infrastructure, optional cleanup of 404.html. Standard CDK/CloudFront pattern.
