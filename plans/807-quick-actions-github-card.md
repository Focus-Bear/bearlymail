Plan: #807 — Quick actions & GitHub card

Goal

Fix issue #807 so that GitHub-related LLM-suggested actions appear in the GitHub UI (or pre-fill quick-actions inputs), and add in-card project status editing.

Summary of problems found

- Current PR #819 only removed `position: sticky` in QuickActionsSection — purely a CSS change that doesn’t address the three requirements.
- Suggested actions pipeline (server → client) already returns GitHub-specific action types (github_add_comment, github_update_status, github_create_issue, github_search_issues) and QuickActionsSection renders anything returned as general quick-action menu items.
- The app already has a dedicated GitHub status UI: components/github/\* (GitHubLinksList, GitHubLinkCard, GitHubProject, etc.). Those are the correct place to show GitHub actions.

Requirements (restating)

1. GitHub-related suggested actions should not render as global quick action buttons. Instead they should either:
   - Pre-populate the QuickActions menu’s inputs with repo/issue info (if kept there), or
   - Preferably, surface inside the GitHub card (recommended by Jeremy).
2. All GitHub actions (add comment, update status, create issue, search issues) should appear in the GitHub card UI, not as standalone quick action buttons.
3. Add a pencil/edit affordance on the project status in the GitHub card so users can change a linked issue’s project status from inside BearlyMail (without opening GitHub). This should call the existing GitHubUpdateStatusModal flow or a new inline editor that calls server endpoints.

Design decisions

- Move GitHub LLM actions into the GitHub card. Rationale: Jeremy’s direction, user-context (links list) already lives in the GitHub card, and GitHub actions are only meaningful when tied to a repo/issue.
- Keep quick actions for non-GitHub actions (calendar, search, follow-up, etc.). If a GitHub action is suggested, it should be filtered out of the QuickActionsSection list and routed into the GitHub card.
- Implementation should be minimal-impact and maintain existing modals (GitHubAddCommentModal, GitHubUpdateStatusModal, GitHubCreateIssueModal, GitHubSearchIssuesModal), reusing them inside the GitHub card.

High-level implementation plan

1. Server / LLM side: No change required (SuggestedActionsService already annotates github actions with metadata.issueInfo and metadata.defaultRepo). But we will confirm the action type names used by the client.

2. Client: SuggestedActions flow
   - Where suggested actions are requested (EmailDetail page), we currently pass suggestedActions into QuickActionsSection. Update the place where suggestedActions are fetched (EmailDetail or parent) to:
     a) Partition suggested actions into githubActions and otherActions.
     b) Pass otherActions to QuickActionsSection unchanged.
     c) Pass githubActions to the GitHubStatusSection / GitHubLinksList / GitHubLinkCard component (via props or a small new prop interface) so GitHub card can display suggested actions for each detected GitHub link.

   Files to change (client):
   - client/src/pages/EmailDetail.tsx — where suggestedActions are fetched and state is kept. Add partition logic here so quick actions no longer get GitHub items.
   - client/src/components/email-detail/QuickActionsSection.tsx — keep as-is for non-GitHub actions (no UI/UX changes necessary aside from receiving filtered list).
   - client/src/components/github/GitHubLinksList.tsx or GitHubLinkCard.tsx — accept additional prop suggestedActions: SuggestedAction[] (or map by link key) and render action buttons where appropriate.
   - client/src/components/github/GitHubLinkCard.tsx — render action buttons (e.g., “Add comment”, “Update status”, “Create issue”) inside the card. When clicked, open the existing modals (GitHubAddCommentModal, GitHubUpdateStatusModal, GitHubCreateIssueModal) with prefilled issueInfo/defaultRepo from action.metadata.

3. UX detail: mapping actions to links
   - The SuggestedActionsService already adds metadata.issueInfo when parsing GitHub links. The client should map githubActions to the matching GitHubLink(s) by owner/repo/number. A safe approach:
     • Build a dedupe key: `${owner}/${repo}#${number}` and attach actions to the matching link card.
     • For github_create_issue actions that target a repo (no issue number), show them in a GitHub repo area (or as an action on the GitHub status header).

4. Project status editing UI
   - In client/src/components/github/GitHubProject.tsx (or GitHubProjectBadges.tsx / GitHubProjectBadges.tsx), add a small pencil icon next to each project status display.
   - Clicking the pencil opens GitHubUpdateStatusModal pre-filled with the issueInfo and current target project + status. On success, update local state (refetch link status or optimistically update the project status in UI).

5. Tests
   - Add unit tests for the partitioning logic in EmailDetail (or the component that receives suggestedActions) to confirm GitHub actions are removed from quick actions and carried into GitHub UI.
   - Add a test for GitHubLinkCard rendering when suggested actions exist (ensures buttons appear and invoke the modals).

6. Backwards compatibility
   - If the GitHub card is hidden (user not connected to GitHub or email has no links), fall back to putting github_create_issue actions into quick-actions (only the create issue action makes sense without a link). For other GitHub actions that require an issue, do not render them if the card/links aren't present.

7. Implementation steps (concrete)

A. Partition actions upstream

- Edit client/src/pages/EmailDetail.tsx: after fetching suggestedActions (server call), split them:
  const githubActionTypes = [
  ACTION_TYPE_GITHUB_ADD_COMMENT,
  ACTION_TYPE_GITHUB_CREATE_ISSUE,
  ACTION_TYPE_GITHUB_SEARCH_ISSUES,
  ACTION_TYPE_GITHUB_UPDATE_STATUS,
  ];
  const githubActions = suggestedActions.filter(a => githubActionTypes.includes(a.type));
  const otherActions = suggestedActions.filter(a => !githubActionTypes.includes(a.type));
- Pass otherActions into QuickActionsSection; keep githubActions in state and pass into GitHubStatusSection as a new prop (e.g., suggestedGitHubActions).

B. Display in GitHub components

- Modify client/src/components/github/GitHubLinksList.tsx or GitHubLinkCard.tsx:
  - Accept suggestedActions prop (SuggestedAction[]). Build map from dedupeKey to actions and render small action buttons in each GitHubLinkCard where actions exist. Example buttons: “Add comment”, “Update status”, “Open suggested action menu”.
  - Use existing modals (imported at top) to open with action.metadata.issueInfo or defaultRepo.

C. Add pencil to project status

- In client/src/components/github/GitHubProjectBadges.tsx (or GitHubProject.tsx): render pencil icon (button) next to project status text. On click, open GitHubUpdateStatusModal with issueInfo + current project status. On success, trigger a refresh of the GitHub link status (call the existing useGitHubLinks fetcher or invoke a refresh prop from the parent).

D. State refresh / optimistic updates

- When GitHubUpdateStatusModal returns success, call the same refresh function used by GitHubStatusSection (likely a prop or hook: useGitHubLinks) to re-fetch project statuses and labels for the link. If no re-fetch helper exists, add a callback prop from EmailDetail → GitHubStatusSection to ask it to refresh.

E. Tests

- Update or add tests in client/**tests** for EmailDetail partition logic and for GitHubLinkCard rendering.

F. Documentation / PR

- Update PR title to be: [PLANNING] #807 Quick actions: move GitHub actions to GitHub card + project status editing
- Remove label rework-for-codebeard, add ready-for-codebeard

Risk and mitigations

- Risk: GitHub card may not be visible (user not connected / no links). Mitigation: fallback behavior places create-issue actions into QuickActions only for github_create_issue.
- Risk: suggestedActions metadata missing issueInfo. Mitigation: show actions only when metadata.issueInfo exists; otherwise fall back to generic behavior (create issue shows default repo prefill if available).

Estimated effort

- Partition & wiring: 2–3 hours
- GitHubLinkCard UI + pencil action + modal wiring: 2–4 hours
- Tests & polish: 1–2 hours

Notes for the implementer

- SuggestedActionsService (server) already attaches issueInfo and defaultRepo metadata — use those.
- Reuse existing modals (GitHubAddCommentModal, GitHubUpdateStatusModal, GitHubCreateIssueModal) to avoid creating new flows.
- Keep QuickActionsSection responsibility to non-GitHub actions only.

---

End of plan file.
