# Plan: #1123 — Don't open sidebar on mobile

**Branch:** `plan/1123-dont-open-sidebar-mobile`
**Author:** monk-of-modularity[bot] (AI planning agent)

## Problem

On mobile, the sidebar opens automatically or is visible when it should be hidden (accessible only via the hamburger menu).

## Investigation

The sidebar on mobile uses `position: fixed` + `transform: translateX(-100%)` to hide off-screen. When `isMobileMenuOpen = true`, it translates to `translateX(0)` to show.

`isMobileMenuOpen` starts as `false` in `useSidebarState`. There is no auto-open logic. So the bug is likely one of:

### Hypothesis A: Sidebar initially renders visible before breakpoint detection

`useResponsiveBreakpoints` uses `window.innerWidth`. On first render (SSR/hydration or fast load), `isMobile` may be `false` briefly (default state) and the sidebar renders as a desktop sidebar (non-fixed, taking layout space), then flashes to the mobile fixed version once the hook resolves. This causes a brief layout shift.

### Hypothesis B: Layout still reserves space for the sidebar

The `Sidebar` component is always rendered in the Inbox flex row. On mobile, `position: fixed` removes it from flow — but the `<div className="flex-1">` sibling may not expand to full width until after the fixed position takes effect.

### Hypothesis C: `isCollapsed` logic doesn't collapse on mobile

`useSidebarState` returns `isCollapsed = false` by default when not on Settings page and split view is inactive. On mobile, `effectiveIsCollapsed = isCollapsed && !isNarrow` correctly avoids collapse. However, the sidebar is still rendered (220px wide as a `position: fixed` overlay).

**Most likely cause:** On mobile, the sidebar should not be rendered as a child of the flex layout at all, or it should render with `display: none` when closed. The current implementation keeps it in the DOM (fixed positioned, off-screen) which is generally fine — but if `isMobile` is initially false and then flips, a layout flash occurs. Also, the Sidebar's fixed-position div still renders with 220px width, and if `position: fixed` somehow fails to apply (e.g., within a transformed ancestor), it would take layout space.

## Proposed Fixes

### Option A: Render Sidebar as `null` on mobile when closed (simplest)

```tsx
// In Sidebar.tsx
if (isNarrow && !isMobileMenuOpen) {
  return null; // Don't render at all when closed on mobile
}
```

**Risk:** Loses slide-in animation. Can be mitigated with a different animation approach (e.g., `react-spring`, or keep in DOM but absolutely positioned only when opening).

### Option B: Add `display: none` when hidden on mobile

```tsx
...(isNarrow && {
  position: 'fixed' as const,
  display: isMobileMenuOpen ? 'flex' : 'none',
  // remove transform entirely
})
```

**Simpler than transform approach, eliminates any layout-space issues.**

### Option C: Add a `useLayoutEffect`-based breakpoint check to prevent flash

Ensure `isNarrow` is computed before first paint by using `useLayoutEffect` instead of `useEffect` in `useResponsiveBreakpoints`, or by defaulting `isMobile` to `true` on mobile-sized initial renders (e.g., checking `window.innerWidth < 768` synchronously).

**Recommendation: Option B** — simplest, no animation loss unless slide-in is deliberately needed, and definitively solves any layout reservation issues.

## Files to Change

| File | Change |
|---|---|
| `client/src/components/inbox/Sidebar.tsx` | Replace `transform: translateX(-100%)` with `display: none` when `isNarrow && !isMobileMenuOpen`. Remove the backdrop `onClick` handler for non-visible state (already guarded by `isMobileMenuOpen`). |
| `client/src/hooks/useResponsiveBreakpoints.ts` | (Optional) Use synchronous `window.innerWidth` check to prevent initial flash |

## Testing

1. On mobile viewport: open `/inbox` → sidebar not visible ✅
2. Tap hamburger → sidebar slides/appears ✅
3. Tap outside overlay → sidebar closes ✅
4. On desktop viewport: sidebar always visible as column ✅
5. On mobile: no layout flash on initial load ✅
