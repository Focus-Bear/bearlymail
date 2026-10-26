import {
  autoResponderJobKey,
  dedupeJobOptions,
  JOB_DEDUPE_WINDOW_SECONDS,
  workflowEvaluationJobKey,
} from "./job-dedupe";

describe("dedupeJobOptions", () => {
  it("always pairs the singleton key with a window so pg-boss actually dedupes", () => {
    expect(
      dedupeJobOptions(
        workflowEvaluationJobKey("thread-1"),
        JOB_DEDUPE_WINDOW_SECONDS.WORKFLOW_EVALUATION,
      ),
    ).toEqual({ singletonKey: "workflow-eval-thread-1", singletonSeconds: 60 });
  });

  it("keeps the auto-responder key both enqueue paths share", () => {
    expect(autoResponderJobKey("thread-1")).toBe("auto-responder-thread-1");
  });
});
