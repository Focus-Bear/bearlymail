# Implementation Plan for Context & Priority Improvements

## Summary of Changes

### 1. More Abstract Context (✅ Completed)
- Updated LLM prompt to extract high-level, abstract themes rather than specific email topics
- Changed examples from "Project Apollo, PR #3724" to "Product management, Mobile app development"

### 2. Human-in-the-Loop for Star Discrepancies (🔄 In Progress)
- Detect when user stars email differently than AI predicted
- Prompt user for explanation
- Store feedback in context for future learning

**Implementation needed:**
- Extend `PriorityLearningService` to compare user star selection vs AI prediction
- Create UI component for asking user "Why did you give this X stars?"
- Store user explanation as context item
- Update context analysis to incorporate user feedback

### 3. Better Priority Explanation UI (🔄 In Progress)
- Change "AI score" to "Goal Alignment"
- Add tooltip showing explanation of why email is prioritized
- Show which contexts contributed (VIP contact, goal alignment, projects, etc.)

**Implementation needed:**
- Extend `PriorityService` to return explanation breakdown
- Add `priorityExplanation` field or calculate on-demand
- Create tooltip component with explanation
- Update `EmailCard.tsx` to use new terminology

### 4. Priority Override Feature (⏳ Pending)
- Add button in priority tooltip to override
- Let user type explanation of why email is NOT urgent/goal aligned
- Store override as context for future learning

**Implementation needed:**
- Create override modal/dialog component
- Add backend endpoint to store overrides
- Link overrides to context learning

## Files to Modify

### Backend:
- `server/src/priority/priority.service.ts` - Add explanation method
- `server/src/priority/priority-learning.service.ts` - Add discrepancy detection
- `server/src/context/context.service.ts` - Store user feedback
- `server/src/database/entities/email.entity.ts` - Add priorityExplanation field (optional)
- `server/src/emails/emails.controller.ts` - Add override endpoint

### Frontend:
- `client/src/components/inbox/EmailCard.tsx` - Update priority display
- `client/src/components/PriorityTooltip.tsx` - New component
- `client/src/components/PriorityOverrideModal.tsx` - New component
- `client/src/pages/Inbox.tsx` - Handle override and discrepancy prompts

