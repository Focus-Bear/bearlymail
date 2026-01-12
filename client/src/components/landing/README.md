# Landing Page Components

## Overview

The landing page has been refactored from a single 852-line file into a modular component architecture following clean code principles. This document explains the structure and design decisions.

## Architecture Principles

### 1. Single Responsibility Principle
Each component has one clear, well-defined responsibility:
- `LandingHeader`: Navigation and branding only
- `HeroSection`: Main headline and value proposition
- `WaitlistForm`: Form handling and submission
- `FeatureCard`: Reusable feature display

### 2. Separation of Concerns
- **UI Components**: Pure presentation logic
- **Custom Hooks**: Business logic and state management (`useResponsiveBreakpoints`)
- **Main Page**: Orchestration and layout only

### 3. Composition Over Inheritance
Components are composed together rather than using inheritance:
```tsx
<Landing>
  <LandingHeader />
  <HeroSection />
  <WaitlistForm />
</Landing>
```

### 4. DRY (Don't Repeat Yourself)
- `CTAButton`: Reusable button component
- `FeatureCard`: Reusable feature display
- `useResponsiveBreakpoints`: Shared responsive logic

## Component Structure

```
components/landing/
├── index.ts                 # Barrel export for clean imports
├── CTAButton.tsx            # Reusable call-to-action button
├── LandingHeader.tsx        # Header with logo and sign-in
├── HeroSection.tsx          # Main headline section
├── IntroSection.tsx         # Origin story section
├── FeatureCard.tsx          # Reusable feature card component
├── HowItWorksSection.tsx     # Features section
├── ComparisonTable.tsx      # Comparison table component
├── ComparisonSection.tsx   # Competitive differentiation
├── ClosingStatement.tsx     # Final CTA section
├── WaitlistForm.tsx         # Waitlist signup form
└── WaitlistSuccess.tsx      # Success state component
```

## Component Guidelines

### When to Create a New Component

1. **Reusability**: If the same UI pattern appears 2+ times
   - Example: `FeatureCard` used 5 times in `HowItWorksSection`

2. **Complexity**: If a section exceeds ~100 lines
   - Example: `ComparisonTable` extracted from `ComparisonSection`

3. **Single Responsibility**: If a component handles multiple concerns
   - Example: Form logic separated into `WaitlistForm`

4. **Testability**: If you want to test a piece in isolation
   - Example: `WaitlistForm` can be tested independently

### Component Size Guidelines

- **Small Components** (< 50 lines): Simple, focused components like `CTAButton`
- **Medium Components** (50-150 lines): Sections like `HeroSection`, `IntroSection`
- **Large Components** (150+ lines): Should be broken down further

### Props Interface Design

Always use TypeScript interfaces with JSDoc comments:

```tsx
interface FeatureCardProps {
  /**
   * Feature title
   */
  title: string;
  /**
   * Feature description paragraphs
   */
  description: string | string[];
  /**
   * Border color on the left side
   */
  borderColor: string;
}
```

### Responsive Design Pattern

All components use the `useResponsiveBreakpoints` hook:

```tsx
const { isMobile, isTablet, isDesktop } = useResponsiveBreakpoints();
```

Breakpoints:
- Mobile: < 640px
- Tablet: 640px - 1279px
- Desktop: >= 1280px

## Code Organization Rules

### 1. File Naming
- Use PascalCase for component files: `HeroSection.tsx`
- Use camelCase for hooks: `useResponsiveBreakpoints.ts`
- Use kebab-case for utilities: `scroll-utils.ts` (if needed)

### 2. Import Organization
```tsx
// 1. React and third-party imports
import React from 'react';
import axios from 'axios';

// 2. Internal hooks
import { useResponsiveBreakpoints } from '../../hooks/useResponsiveBreakpoints';

// 3. Internal components
import { CTAButton } from './CTAButton';

// 4. Theme and utilities
import { theme } from '../../theme/theme';
```

### 3. Component Documentation
Every component should have:
- JSDoc comment explaining purpose
- Interface documentation for props
- Inline comments for complex logic

## Anti-Patterns to Avoid

### ❌ God Components
**Bad**: One component handling everything
```tsx
// DON'T: 500+ line component
const Landing = () => {
  // header logic
  // hero logic
  // form logic
  // comparison logic
  // ...
}
```

**Good**: Separated concerns
```tsx
// DO: Composed components
const Landing = () => (
  <>
    <LandingHeader />
    <HeroSection />
    <WaitlistForm />
  </>
);
```

### ❌ Massive Functions
**Bad**: One function doing multiple things
```tsx
// DON'T: Function with multiple responsibilities
const handleEverything = () => {
  // validate form
  // submit to API
  // update state
  // navigate
  // show toast
}
```

**Good**: Single responsibility functions
```tsx
// DO: Focused functions
const validateForm = () => { /* ... */ };
const submitWaitlist = async () => { /* ... */ };
const handleSuccess = () => { /* ... */ };
```

### ❌ Inline Styles Without Theme
**Bad**: Hardcoded values
```tsx
<div style={{ padding: '16px', color: '#3B82F6' }}>
```

**Good**: Using theme constants
```tsx
<div style={{ 
  padding: theme.spacing.md, 
  color: theme.colors.primary.main 
}}>
```

## Testing Strategy

Each component should be testable in isolation:

```tsx
// Example: Testing WaitlistForm
describe('WaitlistForm', () => {
  it('should call onSuccess after successful submission', async () => {
    const onSuccess = jest.fn();
    // ... test implementation
  });
});
```

## Future Improvements

1. **Extract Constants**: Move feature data to a constants file
2. **Add Tests**: Unit tests for each component
3. **Accessibility**: Add ARIA labels and keyboard navigation
4. **Performance**: Consider React.memo for expensive components
5. **Type Safety**: Extract shared types to a types file

## Migration Notes

When adding new features to the landing page:

1. **Check for Reusability**: Can you use an existing component?
2. **Follow the Pattern**: Match the structure of similar components
3. **Update Documentation**: Add JSDoc comments
4. **Keep Components Small**: If > 150 lines, consider splitting

## References

- [React Component Patterns](https://reactpatterns.com/)
- [Clean Code JavaScript](https://github.com/ryanmcdermott/clean-code-javascript)
- [TypeScript Best Practices](https://typescript-eslint.io/rules/)










