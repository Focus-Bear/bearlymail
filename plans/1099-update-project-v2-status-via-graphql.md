# Plan: #1099 — Update Issue Status saves silently fail (project status not updated)

## Problem

Clicking "Update Status" in the project status edit modal does nothing observable. The
issue's project column status does not change. There is no error message shown to the user.

## Root Cause

The `POST /suggested-actions/github/update-status` endpoint (called by `GitHubUpdateStatusModal`)
currently calls:

```typescript
await octokit.rest.issues.update({ owner, repo, issue_number, state });
```

This updates the **issue's open/closed state** (a REST API call), not the GitHub Projects v2
`Status` field. The REST call succeeds (HTTP 200) but has no effect on the project board column.
Since the response is 200 OK, no error is thrown, and the modal silently closes as if it worked.

The GitHub Projects v2 `Status` field must be updated via the **`updateProjectV2ItemFieldValue`**
GraphQL mutation, which requires:
- `projectId` (node ID of the project)
- `itemId` (node ID of the project item linking the issue to the project)
- `fieldId` (node ID of the Status single-select field)
- `value.singleSelectOptionId` (node ID of the chosen option)

None of these IDs are present in the current flow. The plan in #1098 covers fetching them.

## Fix Overview

Add a new backend endpoint `POST /suggested-actions/github/update-project-status` that
accepts the four required IDs and executes the `updateProjectV2ItemFieldValue` mutation.
Update the frontend modal to call this new endpoint (when in project-status mode).

---

## Backend Changes

### `server/src/github/github-api.service.ts`

Add a new method `updateProjectItemStatus`:

```typescript
/**
 * Update a GitHub Projects v2 item's Status field via GraphQL mutation.
 */
async updateProjectItemStatus(
  token: string,
  projectId: string,
  itemId: string,
  fieldId: string,
  singleSelectOptionId: string,
): Promise<void>
```

**GraphQL mutation to execute:**

```graphql
mutation UpdateProjectV2ItemFieldValue(
  $projectId: ID!
  $itemId: ID!
  $fieldId: ID!
  $optionId: String!
) {
  updateProjectV2ItemFieldValue(
    input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: { singleSelectOptionId: $optionId }
    }
  ) {
    projectV2Item {
      id
    }
  }
}
```

**Error handling:**
- On GraphQL error: log with `this.logger.error(...)` including the mutation name,
  projectId, itemId, fieldId and option ID for traceability.
- If the error indicates bad credentials (401/403), throw `new Error('GitHub token is invalid or expired')`.
- Re-throw all errors so the controller can return a proper HTTP error to the client.
- Do NOT silently swallow errors. This is what caused the original bug.

### `server/src/suggested-actions/suggested-actions.controller.ts`

Add a new POST endpoint:

```typescript
@Post('github/update-project-status')
async updateProjectItemStatus(
  @Request() req,
  @Body()
  body: {
    projectId: string;
    itemId: string;
    fieldId: string;
    optionId: string;
  },
) {
  const { userId } = req.user;
  const user = await this.usersService.findOne(userId);
  if (!user?.githubToken) {
    throw new BadRequestException('GitHub token not configured');
  }

  // Validate all required fields
  if (!body.projectId || !body.itemId || !body.fieldId || !body.optionId) {
    throw new BadRequestException(
      'projectId, itemId, fieldId, and optionId are all required',
    );
  }

  const token = EncryptionHelper.decrypt(user.githubToken);
  await this.githubApiService.updateProjectItemStatus(
    token,
    body.projectId,
    body.itemId,
    body.fieldId,
    body.optionId,
  );

  return { success: true };
}
```

---

## Frontend Changes

### `client/src/components/quick-actions/modals/GitHubUpdateStatusModal.tsx`

This modal is being updated in #1098 to fetch project status options. The save path must
now also be updated to call the new endpoint when in project-status mode.

**In `handleSubmit`**, branch on whether `projectStatusData` is populated:

```typescript
const handleSubmit = async (event: React.FormEvent) => {
  event.preventDefault();
  setLoading(true);
  setError('');

  try {
    if (projectName && projectStatusData && selectedOptionId) {
      // Project status update path (new)
      await axios.post(`${API_URL}/suggested-actions/github/update-project-status`, {
        projectId: projectStatusData.projectId,
        itemId: projectStatusData.itemId,
        fieldId: projectStatusData.fieldId,
        optionId: selectedOptionId,
      });
    } else {
      // Issue open/closed state update path (existing — kept for backwards compatibility)
      await axios.post(`${API_URL}/suggested-actions/github/update-status`, {
        owner: issueInfo.owner,
        repo: issueInfo.repo,
        issueNumber: issueInfo.number,
        state,
      });
    }
    onSuccess();
    onClose();
  } catch (err: any) {
    setError(err.response?.data?.message || 'Failed to update status');
  } finally {
    setLoading(false);
  }
};
```

**Guard against submit with no option selected**: The submit button should be disabled
when `projectName` is set and `selectedOptionId` is empty (no option chosen yet).

---

## Files to Create
- None

## Files to Modify
- `server/src/github/github-api.service.ts` — add `updateProjectItemStatus` method + mutation string
- `server/src/suggested-actions/suggested-actions.controller.ts` — add `POST github/update-project-status`
- `client/src/components/quick-actions/modals/GitHubUpdateStatusModal.tsx` — branch submit on project vs. issue state mode (also modified by #1098)

## Files to Delete
- None

## Implementation Order

Implement after or alongside #1098. The two issues share a single modal file
(`GitHubUpdateStatusModal.tsx`) and the changes must be coordinated in one branch to
avoid merge conflicts:

1. #1098: fetch project status options, add `ProjectStatusSelector`, wire `projectName` prop
2. #1099: add `updateProjectItemStatus` backend method + controller endpoint, update `handleSubmit`

Both can be implemented in a single branch (`fix/1098-1099-project-status-edit`) or in
two sequential branches — whichever the implementer prefers, as long as the final PR includes both.

## Tests
- Unit test `updateProjectItemStatus`:
  - success case: calls octokit.graphql with correct variables
  - bad credentials error: throws human-readable error
  - generic error: rethrows
- Unit test controller endpoint:
  - validates all four required fields are present
  - returns 400 when any field missing
  - returns `{ success: true }` on success
- E2E (optional): selecting a project column option and clicking "Update Status" changes
  the project item's Status field on GitHub.
