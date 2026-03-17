# Plan: #1098 — Pencil icon shows Open/Closed instead of project column statuses

## Problem

When clicking the ✏️ pencil icon next to a project status badge in `GitHubProject.tsx`,
the modal opens `GitHubUpdateStatusModal` which internally renders `StatusSelector`.
`StatusSelector` is a hardcoded two-option component showing only Open and Closed (GitHub
issue states). No project context is passed from `GitHubProject.tsx` into the modal, so
the modal has no way to fetch or display the actual project column statuses
(e.g. "Unprioritised", "In Progress", "Ready for QA", "Done").

## Root Cause

`GitHubProject.tsx` — pencil click:
```tsx
<GitHubUpdateStatusModal
  issueInfo={issueInfo}   // only owner/repo/number — no project context
  onClose={...}
  onSuccess={...}
/>
```

`GitHubUpdateStatusModal` — only ever shows open/closed:
```tsx
const [state, setState] = useState<'open' | 'closed'>('closed');
// uses StatusSelector which hardcodes Open/Closed radio buttons
```

`StatusSelector` — hardcoded to issue states:
```tsx
// GITHUB_STATE_OPEN / GITHUB_STATE_CLOSED only — no dynamic options
```

There is no backend endpoint to fetch available project column status options.

## Fix Overview

This fix has three parts:

1. **New backend endpoint**: `GET /github/project-status-options` — given
   `owner`, `repo`, `issueNumber`, `projectName`, returns the available single-select
   option names for the Status field of the specified project, plus the IDs needed to
   update the field (projectId, itemId, fieldId, options with their singleSelectOptionIds).

2. **New frontend fetch in the modal**: `GitHubUpdateStatusModal` accepts an optional
   `projectName` prop, and when present, fetches project status options instead of showing
   the hardcoded Open/Closed selector.

3. **Updated `StatusSelector`**: Rename/replace with `ProjectStatusSelector` that accepts
   a dynamic list of options.

---

## Backend Changes

### `server/src/github/github-api.service.ts`

Add a new GraphQL query and method `getProjectStatusOptions`.

**New GraphQL query** (fetches project item IDs + status field options):

```graphql
query($owner: String!, $repo: String!, $issueNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $issueNumber) {
      projectItems(first: 20) {
        nodes {
          id                    # ProjectV2Item id (itemId)
          project {
            ... on ProjectV2 {
              id                # projectId
              title
              fields(first: 20) {
                nodes {
                  ... on ProjectV2SingleSelectField {
                    id          # fieldId
                    name
                    options {
                      id        # singleSelectOptionId
                      name
                      color
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

**New method signature**:
```typescript
async getProjectStatusOptions(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  projectName: string,
): Promise<{
  projectId: string;
  itemId: string;
  fieldId: string;
  options: Array<{ id: string; name: string; color: string }>;
} | null>
```

Logic:
- Execute the new GraphQL query
- Find the `projectItems.nodes` entry whose `project.title === projectName`
- Within that project's `fields.nodes`, find the field named `"Status"` (case-insensitive)
- Return `{ projectId, itemId, fieldId, options }` or `null` if not found
- On error, log and return `null`

### `server/src/github/github.controller.ts`

Add a new GET endpoint:

```typescript
@Get('project-status-options')
async getProjectStatusOptions(
  @Request() req,
  @Query('owner') owner: string,
  @Query('repo') repo: string,
  @Query('issueNumber') issueNumber: string,
  @Query('projectName') projectName: string,
) {
  const { userId } = req.user;
  const user = await this.usersService.findOne(userId);
  if (!user?.githubToken) {
    throw new BadRequestException('GitHub token not configured');
  }
  const token = EncryptionHelper.decrypt(user.githubToken);
  const result = await this.githubApiService.getProjectStatusOptions(
    token, owner, repo, parseInt(issueNumber, 10), projectName,
  );
  if (!result) {
    throw new NotFoundException('Project or status field not found');
  }
  return result;
}
```

---

## Frontend Changes

### `client/src/components/quick-actions/modals/GitHubUpdateStatusModal.tsx`

**Accept `projectName` as an optional prop:**

```typescript
interface GitHubUpdateStatusModalProps {
  issueInfo: {
    owner: string;
    repo: string;
    number: number;
  };
  projectName?: string;   // NEW — when set, shows project column options
  onClose: () => void;
  onSuccess: () => void;
}
```

**When `projectName` is defined**, the modal should:

1. On mount (useEffect on `[issueInfo, projectName]`), call:
   ```
   GET /github/project-status-options?owner=...&repo=...&issueNumber=...&projectName=...
   ```
   and store the result (`projectStatusData` with `{projectId, itemId, fieldId, options}`).

2. Show a loading spinner while fetching options.

3. Render `ProjectStatusSelector` (see below) instead of the existing `StatusSelector`.

4. On submit, call `POST /suggested-actions/github/update-project-status` (see #1099 plan)
   instead of the current `update-status` endpoint.

**When `projectName` is NOT defined** (backwards compat — for the action button flow):
- Keep existing behaviour: show Open/Closed selector, call `update-status` endpoint.

**State additions:**
```typescript
const [projectStatusData, setProjectStatusData] = useState<{
  projectId: string;
  itemId: string;
  fieldId: string;
  options: Array<{ id: string; name: string; color: string }>;
} | null>(null);
const [selectedOptionId, setSelectedOptionId] = useState<string>('');
const [fetchingOptions, setFetchingOptions] = useState(false);
```

**Error handling**: if the options fetch fails, show an error message and a fallback
"reload" button. Do not silently fail.

### `client/src/components/quick-actions/modals/github/ProjectStatusSelector.tsx` (NEW FILE)

New component that replaces `StatusSelector` for the project-status flow:

```typescript
interface ProjectStatusSelectorProps {
  options: Array<{ id: string; name: string; color: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
}

export const ProjectStatusSelector: React.FC<ProjectStatusSelectorProps> = ({
  options,
  selectedId,
  onSelect,
}) => { /* renders radio list of options by name, with color dot */ }
```

- Renders each option as a radio button with its name (and optional colour indicator).
- No hardcoded values. All options come from the prop array.

### `client/src/components/github/GitHubProject.tsx`

Pass the clicked project's name into the modal:

**Before:**
```tsx
<GitHubUpdateStatusModal
  issueInfo={issueInfo}
  onClose={() => setEditingProject(null)}
  onSuccess={...}
/>
```

**After:**
```tsx
<GitHubUpdateStatusModal
  issueInfo={issueInfo}
  projectName={editingProject ?? undefined}
  onClose={() => setEditingProject(null)}
  onSuccess={...}
/>
```

`editingProject` is already the project name string from `setEditingProject(project.name)`,
so this requires no additional state.

---

## Files to Create
- `client/src/components/quick-actions/modals/github/ProjectStatusSelector.tsx`

## Files to Modify
- `server/src/github/github-api.service.ts` — add `getProjectStatusOptions` method + GraphQL query
- `server/src/github/github.controller.ts` — add `GET /github/project-status-options`
- `client/src/components/quick-actions/modals/GitHubUpdateStatusModal.tsx` — accept `projectName`, fetch options, render `ProjectStatusSelector`
- `client/src/components/github/GitHubProject.tsx` — pass `projectName={editingProject}` to modal

## Files to Delete
- None (keep `StatusSelector.tsx` — it is still used by the non-project update-status flow)

## Dependencies
- **Blocked by**: Nothing — can implement standalone.
- **Related**: #1099 adds the `POST /suggested-actions/github/update-project-status` endpoint
  that the updated modal will call when saving. Implement #1098 first to establish the data
  model; implement #1099 to complete the save path.

## Tests
- Unit test `getProjectStatusOptions`: returns correct shape when project name matches; returns null when project not found; returns null when Status field not found.
- Unit test `ProjectStatusSelector`: renders all options; fires onSelect with the correct option id.
- E2E (optional): clicking pencil on a project badge shows project column names, not Open/Closed.
