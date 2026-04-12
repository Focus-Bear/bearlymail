# Plan: Fix Font Too Small in Multiple UI Areas

**Issue:** #1437
**Branch:** `openclaw/plan-1437-font-too-small`
**Author:** Monk of Modularity 🧘 (AI agent)

---

## Problem Summary

Multiple UI areas across BearlyMail use font sizes that are too small for comfortable reading. The root cause is the theme's typography scale: `fontSize.xs` = 8px and `fontSize.sm` = 10px are used extensively across 100+ components. These sizes are below the widely-accepted 12px minimum for readable body text on screens.

### Affected Areas (from screenshots)

1. **Onboarding / "Learning About You" step** — "What we're learning" card text (writing style, current focus insights) at 10px
2. **Email list / triage cards** — AI-generated descriptions, priority labels ("Can wait" / "Get on it" / "Oh sh!t"), timestamps, sender tags, "Archive"/"Block sender" links all at 8px
3. **"Re-analyse categories" / "Archive All" buttons** — button text at 10px, "Next batch" / "Last checked" status text at 8px, "Clear all filters" at 10px
4. **Footer** — email address, "Log Out", "Made by Focus Bear" all at 8px
5. **Tone Checker settings** — description text and input placeholder at 10px; Scheduling Preferences text at 10px
6. **Search results page** — helper text below search bar at 10px, "Found X emails" at 10px, relevance badges at 8px, email preview content at 10px, timestamps at 8px
7. **Email Detail panel** — "PRIORITIZE" label, priority button labels, "Scheduling Request Detected" text, "Thread (X message)" label, Private Notes placeholder all at 8px–10px

---

## Root Cause Analysis

### The Theme Scale Problem

The theme (`client/src/theme/theme.ts`) defines a typography scale where:

| Token           | Current Size    | Usage Count (approx)  |
| --------------- | --------------- | --------------------- |
| `fontSize.xs`   | 0.5rem (8px)    | ~100 components       |
| `fontSize.sm`   | 0.625rem (10px) | ~130 components       |
| `fontSize.md`   | 0.75rem (12px)  | Used as `body.medium` |
| `fontSize.lg`   | 0.875rem (14px) | Used as `body.large`  |
| `fontSize.base` | 1rem (16px)     | Used as `body.xLarge` |

The problem: 8px and 10px text is simply too small. Industry standards (WCAG, Apple HIG, Material Design) recommend **12px as the absolute minimum** for body text, with 14px preferred for secondary text.

### Why Not Just Bump the Theme Tokens?

Changing `fontSize.xs` from 8px → 12px and `fontSize.sm` from 10px → 14px in the theme would fix all ~230 components at once, BUT:

1. Some uses of `xs`/`sm` are intentional (debug panels, admin-only views, tooltips)
2. A global bump could break layouts where tight spacing was designed around small text
3. The `body` scale aliases would become confusing (body.medium = 12px = the new xs?)

The safer approach: **adjust the theme scale AND selectively audit high-impact user-facing components**.

---

## Implementation Plan

### Phase 1: Adjust Theme Typography Scale

**File:** `client/src/theme/theme.ts`

Bump the bottom of the scale up. The new minimum readable size is 12px.

```ts
// BEFORE (current)
body: {
  xLarge: { fontSize: '1rem' },      // 16px
  large:  { fontSize: '0.875rem' },   // 14px
  medium: { fontSize: '0.75rem' },    // 12px
  small:  { fontSize: '0.625rem' },   // 10px
  xSmall: { fontSize: '0.5rem' },     // 8px
}
fontSize: {
  xs:   '0.5rem',    // 8px
  sm:   '0.625rem',  // 10px
  md:   '0.75rem',   // 12px
  base: '1rem',      // 16px
  lg:   '0.875rem',  // 14px
  ...
}

// AFTER (proposed)
body: {
  xLarge: { fontSize: '1rem' },      // 16px — unchanged
  large:  { fontSize: '0.875rem' },   // 14px — unchanged
  medium: { fontSize: '0.8125rem' },  // 13px — bump from 12px
  small:  { fontSize: '0.75rem' },    // 12px — bump from 10px
  xSmall: { fontSize: '0.6875rem' },  // 11px — bump from 8px
}
fontSize: {
  xs:   '0.6875rem', // 11px (was 8px) — minimum for non-debug text
  sm:   '0.75rem',   // 12px (was 10px) — small labels, timestamps
  md:   '0.8125rem', // 13px (was 12px) — secondary body text
  base: '1rem',      // 16px — unchanged
  lg:   '0.875rem',  // 14px — unchanged
  ...
}
```

**Rationale:** This lifts ALL uses of `xs` and `sm` above the 11px floor with a single change. Components that used `xs` (8px) for genuinely tiny text (debug panels) will get 11px — still small but readable.

### Phase 2: Fix High-Impact Components (User-Facing)

These components need attention beyond the global theme bump because they use `xs`/`sm` where they should use `lg` or `base`:

#### 2A. AppFooter — email, logout, attribution

**File:** `client/src/components/AppFooter.tsx`

Lines 24, 32, 40: Change `fontSize.xs` → `fontSize.sm` (will be 12px after Phase 1).

The footer text (email address, "Log Out" button, attribution) should be at least 12px.

#### 2B. Onboarding — ContextAnalysisStep insights

**File:** `client/src/components/setup-wizard/ContextAnalysisStep.tsx`

- Line 52, 63: `fontSize.sm` → `fontSize.lg` (14px) — "What we're learning" insight text should be clearly readable
- Line 101: `fontSize.sm` → `fontSize.lg` (14px) — learning insight values
- Lines 118, 129: `fontSize.xs` → `fontSize.sm` (12px) — meta labels

#### 2C. Email Card — AI descriptions, priority labels, timestamps

**File:** `client/src/components/inbox/EmailCard.tsx`

- Line 80: `fontSize.xs` → `fontSize.sm` (12px)

**File:** `client/src/components/inbox/email-card/EmailTimestamp.tsx`

- All `fontSize.xs` → `fontSize.sm` (12px)

**File:** `client/src/components/inbox/email-card/PriorityBadge.tsx`

- All `fontSize.xs` → `fontSize.sm` (12px)

**File:** `client/src/components/inbox/email-card/EmailCardActions.tsx`

- All `fontSize.xs` → `fontSize.sm` (12px) — "Archive" / "Block sender" links

**File:** `client/src/components/inbox/email-card/EmailLabels.tsx`

- All `fontSize.xs` → `fontSize.sm` (12px) — tag pills

**File:** `client/src/components/inbox/email-card/UrgencyBadge.tsx`

- All `fontSize.xs` → `fontSize.sm` (12px)

**File:** `client/src/components/inbox/EmailPreview.tsx`

- Line 25: `fontSize.sm` → `fontSize.lg` (14px) — email preview text should be scannable
- Line 117: `fontSize.xs` → `fontSize.sm` (12px)

#### 2D. Email Actions Row — priority suggestions, action links

**File:** `client/src/components/inbox/EmailActionsRow.tsx`

- Lines 51, 60, 102, 128, 209, 298: `fontSize.xs` → `fontSize.sm` (12px) — all action text

#### 2E. Batch Info Bar — "Next batch", "Last checked" status

**File:** `client/src/components/inbox/BatchInfoBar.tsx`

- Line 49: `fontSize.xs` → `fontSize.sm` (12px)
- Line 75: `fontSize.sm` → `fontSize.lg` (14px) — "Re-analyse categories" / "Archive All" buttons

#### 2F. Category Accordion — button text, counts

**File:** `client/src/components/inbox/CategoryAccordion.tsx`

- Lines 77, 162, 178, 259, 297: `fontSize.sm` → `fontSize.lg` (14px) — "Re-analyse categories" / "Archive All" action buttons
- Line 140: `fontSize.lg` — already fine

#### 2G. Email Detail Panel — priority buttons, labels, thread info

**File:** `client/src/components/email-detail/PriorityButtonRow.tsx`

- All `fontSize.xs` → `fontSize.sm` (12px) — "PRIORITIZE" label and button text

**File:** `client/src/components/email-detail/EmailDetailHeaderView.tsx`

- All `fontSize.xs` → `fontSize.sm` (12px) — header metadata

**File:** `client/src/components/email-detail/SchedulingRequestCard.tsx`

- All `fontSize.sm` → `fontSize.lg` (14px) — description text

**File:** `client/src/components/email-detail-inline/PrivateNotesSection.tsx`

- All `fontSize.xs` → `fontSize.sm` (12px) — placeholder and note text

#### 2H. Search Results — helper text, relevance badges, previews

**File:** `client/src/components/search/SearchForm.tsx`

- Line 62: `fontSize.sm` → `fontSize.lg` (14px) — helper text below search bar

**File:** `client/src/components/search/SearchResults.tsx`

- Line 84: `fontSize.sm` → `fontSize.lg` (14px) — "Found X emails"
- Lines 128, 297, 318, 335, 371: `fontSize.xs` → `fontSize.sm` (12px) — timestamps, relevance badges
- Line 180: `fontSize.sm` → `fontSize.lg` (14px) — email preview text
- Line 355: `fontSize.sm` → `fontSize.lg` (14px) — result text

**File:** `client/src/components/search/SearchHeader.tsx`

- All `fontSize.xs` → `fontSize.sm` (12px)

#### 2I. Settings — Tone Checker, Scheduling Preferences

**File:** `client/src/components/settings/guide-ai/ToneSettingsSection.tsx`

- Line 44: `fontSize.sm` → `fontSize.lg` (14px) — description text
- Line 155: `fontSize.sm` → `fontSize.lg` (14px) — input label

**File:** `client/src/components/settings/SchedulingPreferencesSection.tsx`

- All `fontSize.sm` → `fontSize.lg` (14px) — section is noted as smaller than siblings

#### 2J. Inbox Header / Filters

**File:** `client/src/components/inbox/InboxHeader.tsx`

- `fontSize.xs` → `fontSize.sm` (12px) — filter metadata

**File:** `client/src/components/inbox/InboxFilters.tsx`

- `fontSize.sm` → `fontSize.lg` (14px) — filter labels, dropdown text

### Phase 3: Exclude Admin/Debug Components

Components in `client/src/components/admin/` and debug panels should NOT be changed — they're power-user UIs where dense text is acceptable. The theme bump in Phase 1 will give them 11px minimum automatically, which is sufficient.

### Phase 4: Visual Regression Check

After all changes, visually check:

- [ ] Email card layout doesn't overflow with larger text
- [ ] Category accordion still fits action buttons on one line
- [ ] Search results cards maintain alignment
- [ ] Footer doesn't wrap awkwardly on narrow viewports
- [ ] Settings sections maintain consistent sizing with siblings
- [ ] Onboarding insights card doesn't exceed container bounds

---

## Testing Strategy

### Unit Tests

- Existing Storybook stories (if present) should be visually reviewed
- No logic changes — this is purely visual

### Visual Regression

- Screenshot comparison of key pages: Inbox, Search, Settings, Onboarding
- Check at common viewport widths: 1280px, 1440px, 1920px

### Manual QA Checklist

- [ ] Onboarding "What we're learning" card — text readable at arm's length
- [ ] Email cards in triage — all text elements ≥ 12px
- [ ] "Re-analyse categories" / "Archive All" buttons — clearly readable
- [ ] Footer — email, logout, attribution readable
- [ ] Search results — helper text, relevance badges, previews all readable
- [ ] Email Detail panel — priority buttons, scheduling card, thread info readable
- [ ] Settings — Tone Checker, Scheduling Preferences match sibling sections
- [ ] No layout overflow or wrapping issues from larger text

---

## Risk Assessment

| Risk                             | Severity | Mitigation                                                              |
| -------------------------------- | -------- | ----------------------------------------------------------------------- |
| Layout overflow from larger text | Medium   | Phase 4 visual check; use `text-overflow: ellipsis` where needed        |
| Breaking admin panel density     | Low      | Admin components excluded from Phase 2; Phase 1 bump is modest (8→11px) |
| Missing a component              | Low      | Phase 1 global bump catches any missed components at minimum            |
| Theme token confusion            | Low      | Add comments to theme.ts explaining the scale rationale                 |

---

## Implementation Order

1. **Phase 1** — Theme scale adjustment (single file, catches all 230+ components)
2. **Phase 2** — High-impact component overrides (targeted file edits)
3. **Phase 4** — Visual regression check (before PR merge)

Estimated scope: ~150-200 lines changed across ~25 files. Mostly `fontSize.xs` → `fontSize.sm` and `fontSize.sm` → `fontSize.lg` token swaps.

---

Plan by Monk of Modularity 🧘 (AI agent)
