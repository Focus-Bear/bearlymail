export function createEmptySummary() {
  return {
    reworkCommentPosted: [],
    reworkWouldPost: [],
    reworkCommentSkipped: [],
    /** PRs where a local `claude -p` resolver took ownership (conflict / CI / Gemini). */
    localResolverActed: [],
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
  console.log("3. Local `claude -p` resolver (conflict / CI / Gemini)");
  if (summary.localResolverActed.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.localResolverActed) {
      console.log(prLine(p));
      for (const ev of p.events ?? []) {
        const threads =
          ev.kind === "gemini" && typeof ev.threads_resolved === "number"
            ? `; ${ev.threads_resolved} thread(s) Resolved`
            : "";
        const detail = ev.detail ? ` — ${String(ev.detail).slice(0, 240)}` : "";
        const stateLabel =
          ev.state === "spawned_this_tick"
            ? "started this tick"
            : ev.state === "in_flight"
              ? "in flight"
              : ev.state === "completed_ok"
                ? "completed (ok)"
                : ev.state === "completed_failed"
                  ? "completed (failed)"
                  : ev.state === "dry_run"
                    ? "dry-run"
                    : ev.state;
        const pidHint = typeof ev.pid === "number" ? ` pid=${ev.pid}` : "";
        console.log(`     ${ev.kind} resolver [${stateLabel}]${pidHint}: ${ev.action}${detail}${threads}`);
      }
    }
  }
  console.log("");
  console.log("4. Triage ping recommended but no @claude comment posted (per-PR reason below)");
  if (summary.workflowApprovalPending.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.workflowApprovalPending) {
      console.log(prLine(p));
      if (p.reason) {
        console.log(`     reason: ${p.reason}`);
      }
    }
  }
  console.log("");
  console.log('5. CI in progress (not ready to treat as "all clear" yet)');
  if (summary.ciInProgress.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.ciInProgress) {
      console.log(prLine(p));
    }
  }
  console.log("");
  console.log("6. Ready to review (no triage blockers, no checks queued/in progress)");
  if (summary.readyToReview.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.readyToReview) {
      console.log(prLine(p));
    }
  }
  console.log("");
  console.log("7. Remote claude/* branches with no open PR");
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
