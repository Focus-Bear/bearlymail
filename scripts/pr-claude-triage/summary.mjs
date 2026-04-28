export function createEmptySummary() {
  return {
    reworkCommentPosted: [],
    reworkWouldPost: [],
    reworkCommentSkipped: [],
    workflowApprovalPending: [],
    readyToReview: [],
    /** PRs with no triage blockers but check runs still queued/running (not "ready" yet) */
    ciInProgress: [],
    /** Triage state label sync events (see DEFAULT_TRIAGE_STATE_LABELS) */
    triageStateLabelSync: [],
  };
}

export function formatUnknown(val) {
  if (val === null || val === undefined) return "UNKNOWN";
  return String(val);
}

export function prLine(p) {
  return `   - #${p.number} ${p.title} — ${p.url}`;
}

export function printConsoleSummary(summary, orphanClaudeBranches) {
  const orphans = orphanClaudeBranches ?? [];
  console.log("=== Summary ===");
  console.log("");
  console.log("1. Requires rework (comment triggered)");
  if (summary.reworkCommentPosted.length === 0 && summary.reworkWouldPost.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.reworkCommentPosted) {
      console.log(prLine(p));
    }
    for (const p of summary.reworkWouldPost) {
      console.log(
        `   - #${p.number} ${p.title} — ${p.url} (dry-run: would post)`,
      );
    }
  }
  console.log("");
  console.log("2. Requires rework (comment skipped)");
  if (summary.reworkCommentSkipped.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.reworkCommentSkipped) {
      console.log(prLine(p));
      if (p.detail) {
        console.log(`     ${p.detail}`);
      }
    }
  }
  console.log("");
  console.log(
    "3. Triage ping recommended but no @claude comment posted — cannot delegate this signal to Claude (examples: GitHub merge/blocked gate or min green checks not satisfied, workflows awaiting approval, CI still running, duplicate comment skipped while Claude Code busy — not solvable by in-repo edits alone)",
  );
  if (summary.workflowApprovalPending.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.workflowApprovalPending) {
      console.log(prLine(p));
    }
  }
  console.log("");
  console.log('4. CI in progress (not ready to treat as "all clear" yet)');
  if (summary.ciInProgress.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.ciInProgress) {
      console.log(prLine(p));
    }
  }
  console.log("");
  console.log("5. Ready to review (no triage blockers, no checks queued/in progress)");
  if (summary.readyToReview.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.readyToReview) {
      console.log(prLine(p));
    }
  }
  console.log("");
  console.log("6. Remote claude/* branches with no open PR");
  if (orphans.length === 0) {
    console.log("   (none — every claude/* head on the remote has an open PR, or there are no claude/* branches)");
  } else {
    for (const o of orphans) {
      const shaBit = o.sha ? ` @ ${String(o.sha).slice(0, 7)}` : "";
      console.log(`   - ${o.name}${shaBit}`);
    }
  }
  console.log("");
}
