# Plan: fix(#1430) — Onboarding page (WelcomeStep) fixes

**File:** `client/src/components/setup-wizard/WelcomeStep.tsx`

## Fix 1: Remove "Use Your Own OpenAI Key" dropdown

- **Delete** the entire `OpenAiSection` component (lines 22–99)
- **Remove** related state from `WelcomeStep`: `openAiApiKey`, `showApiKey`, `openAiExpanded`, `toggleOpenAiSection`
- **Remove** the OpenAI API key POST call in `handleContinue` (the `if (openAiApiKey.trim())` block)
- **Remove** `<OpenAiSection ... />` from the JSX render
- **Remove** unused import: `useCallback`

## Fix 2: Increase font size in "Your Privacy Matters" box

- In `WelcomePrivacyBlock`, the `<p>` uses `theme.typography.fontSize.sm` (= 10px — far too small)
- **Change** paragraph `fontSize` from `fontSize.sm` → `fontSize.base` (16px)
- Also bump the `<h3>` title from `fontSize.lg` (14px) → `fontSize.xl` (20px) for better hierarchy

## Fix 3: Fix vertical alignment of Terms checkbox

- In `ConsentField`, the `<label>` uses `alignItems: 'flex-start'` with checkbox `marginTop: '2px'`
- **Change** `alignItems: 'flex-start'` → `alignItems: 'center'`
- **Remove** `marginTop: '2px'` from checkbox styles (no longer needed with center alignment)

## Scope

Single file change. No backend changes. No new dependencies.
