import { Logger } from "@nestjs/common";
import { spawn, spawnSync } from "child_process";
import * as os from "os";

import { MILLISECONDS } from "../constants/time-constants";
import { LLMProvider, LLMRequest } from "./llm.types";
import { LLM_OP_UNKNOWN } from "./llm-operations";
import { TokenUsageService } from "./token-usage.service";

/**
 * Defaults for the "claude-cli" provider, which shells out to a locally
 * installed Claude Code binary (`claude -p`). The CLI brings its own auth,
 * so no API key is needed and none is wired in — the child process simply
 * inherits the server's environment.
 */
const DEFAULT_CLAUDE_CLI_PATH = "claude";
const DEFAULT_CLAUDE_CLI_MODEL = "sonnet";
/**
 * Hard ceiling for a single CLI generation. Enforced via `spawn`'s built-in
 * `timeout` option, which kills the child with `killSignal` when exceeded.
 */
const CLAUDE_CLI_TIMEOUT_MS = 3 * MILLISECONDS.MINUTE;
/** Cap for the one-off `claude --version` availability probe. */
const CLAUDE_CLI_PROBE_TIMEOUT_MS = 10 * MILLISECONDS.SECOND;
/**
 * After a failed `--version` probe, wait this long before re-probing. A
 * confirmed-available CLI is cached permanently, but a *failure* is not: the
 * first probe can fail transiently (PATH not ready at boot, a spawn timing out
 * under memory pressure), and caching that forever would wrongly disable
 * claude-cli for the whole process. Instead we back off and retry.
 */
const CLAUDE_CLI_PROBE_RETRY_BACKOFF_MS = MILLISECONDS.MINUTE / 2;
/** Max chars of CLI stderr/result quoted in thrown error messages. */
const CLAUDE_CLI_ERROR_SNIPPET_LENGTH = 500;

/** The single-result JSON envelope printed by `claude -p --output-format json`. */
interface ClaudeCliEnvelope {
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * The Claude CLI has no native JSON output mode, so even when instructed the
 * model occasionally wraps its answer in markdown fences. Strips one outer
 * ```json ... ``` (or bare ```) fence, leaving fence-less output untouched.
 */
export function stripMarkdownJsonFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

/**
 * Thin client around the local Claude Code CLI. Owns binary resolution, the
 * cached availability probe, and one-shot non-interactive generations.
 * Deliberately not @Injectable — LLMCoreService constructs it with a config
 * getter so this file stays free of Nest wiring.
 */
export class ClaudeCliClient {
  /** Sticky once the `claude --version` probe succeeds. */
  private available = false;
  /**
   * Epoch ms of the last failed probe (0 = never failed / not yet probed).
   * Re-probes are throttled by CLAUDE_CLI_PROBE_RETRY_BACKOFF_MS so a transient
   * failure doesn't spawn `--version` on every call.
   */
  private lastFailedProbeAt = 0;

  constructor(
    private readonly getConfigValue: (key: string) => string | undefined,
    private readonly logger: Logger,
    private readonly tokenUsageService: TokenUsageService,
  ) {}

  get cliPath(): string {
    return this.getConfigValue("CLAUDE_CLI_PATH") || DEFAULT_CLAUDE_CLI_PATH;
  }

  /**
   * Whether the Claude Code CLI binary can be executed. Probed lazily with a
   * `claude --version` spawn. A success is cached for the process lifetime; a
   * failure is retried after a backoff window rather than cached permanently,
   * so a transient first-probe failure can't disable claude-cli for good.
   */
  isAvailable(): boolean {
    if (this.available) {
      return true;
    }
    // Within the backoff window after a recent failure — skip re-probing.
    if (
      this.lastFailedProbeAt &&
      Date.now() - this.lastFailedProbeAt < CLAUDE_CLI_PROBE_RETRY_BACKOFF_MS
    ) {
      return false;
    }
    const probe = spawnSync(this.cliPath, ["--version"], {
      stdio: "ignore",
      timeout: CLAUDE_CLI_PROBE_TIMEOUT_MS,
    });
    if (!probe.error && probe.status === 0) {
      this.available = true;
      this.lastFailedProbeAt = 0;
      this.logger.log("Claude CLI detected, claude-cli provider available");
      return true;
    }
    this.lastFailedProbeAt = Date.now();
    this.logger.warn(
      `Claude CLI probe failed (CLAUDE_CLI_PATH=${this.cliPath}); will retry after backoff: ${
        probe.error?.message ?? `exit code ${probe.status}`
      }`,
    );
    return false;
  }

  /**
   * Run one generation through `claude -p` and log token usage. JSON mode is
   * instructed via the system prompt (the CLI has no JSON output flag for the
   * model's answer, mirroring the Anthropic path) and stray markdown fences
   * are stripped. Throws on any CLI failure; the caller owns retries and
   * provider fallback.
   */
  async generate(request: LLMRequest, userId?: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error(
        `Claude CLI not available (CLAUDE_CLI_PATH=${this.cliPath})`,
      );
    }

    const model =
      request.model ||
      this.getConfigValue("CLAUDE_CLI_MODEL") ||
      DEFAULT_CLAUDE_CLI_MODEL;

    let systemPrompt = request.systemPrompt || "";
    if (request.jsonMode && !systemPrompt.includes("JSON")) {
      systemPrompt = `${systemPrompt}\nRespond with valid JSON only. No markdown fences, no commentary.`;
    }

    this.logger.debug(`Generating text with Claude CLI model: ${model}`);
    const startTime = Date.now();
    const envelope = await this.run({
      model,
      prompt: request.prompt,
      systemPrompt: systemPrompt || undefined,
    });

    if (envelope.usage) {
      // Cached tokens still enter the model's context, so count them as
      // prompt tokens (the envelope's input_tokens excludes cache reads).
      const promptTokens =
        (envelope.usage.input_tokens || 0) +
        (envelope.usage.cache_creation_input_tokens || 0) +
        (envelope.usage.cache_read_input_tokens || 0);
      const completionTokens = envelope.usage.output_tokens || 0;
      await this.tokenUsageService.logUsage({
        userId: userId ?? null,
        operation: request.operation || LLM_OP_UNKNOWN,
        provider: LLMProvider.CLAUDE_CLI,
        model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        durationMs: Date.now() - startTime,
        promptText: request.prompt,
        systemPromptText: request.systemPrompt,
        emailIds: request.metadata?.emailIds,
      });
    }

    const result = envelope.result ?? "";
    return request.jsonMode ? stripMarkdownJsonFences(result) : result;
  }

  /**
   * Spawn one non-interactive `claude -p` call and parse its JSON result
   * envelope. The user prompt is written to stdin (avoids ARG_MAX on large
   * emails); all tools are disabled so the call is pure text generation; cwd
   * is the OS temp dir so the CLI never picks up this repo's .claude project
   * settings. Node kills the child with SIGKILL after the timeout.
   */
  private run(options: {
    model: string;
    prompt: string;
    systemPrompt?: string;
  }): Promise<ClaudeCliEnvelope> {
    const { cliPath } = this;
    const args = [
      "-p",
      "--output-format",
      "json",
      "--model",
      options.model,
      "--tools",
      "",
      "--no-session-persistence",
    ];
    if (options.systemPrompt) {
      args.push("--system-prompt", options.systemPrompt);
    }

    return new Promise<ClaudeCliEnvelope>((resolve, reject) => {
      const child = spawn(cliPath, args, {
        cwd: os.tmpdir(),
        timeout: CLAUDE_CLI_TIMEOUT_MS,
        killSignal: "SIGKILL",
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) =>
        fail(
          new Error(`Failed to run Claude CLI '${cliPath}': ${error.message}`),
        ),
      );
      // Swallow stdin write errors (EPIPE when the child dies before reading
      // the prompt) — the close/error handlers report the real failure.
      child.stdin.on("error", () => undefined);
      child.on("close", (code, signal) => {
        if (settled) return;
        if (signal) {
          return fail(
            new Error(
              `Claude CLI killed with ${signal} (timeout ${CLAUDE_CLI_TIMEOUT_MS}ms exceeded or external kill)`,
            ),
          );
        }
        const snippet = (stderr || stdout).slice(
          0,
          CLAUDE_CLI_ERROR_SNIPPET_LENGTH,
        );
        if (code !== 0) {
          return fail(
            new Error(`Claude CLI exited with code ${code}: ${snippet}`),
          );
        }
        let envelope: ClaudeCliEnvelope;
        try {
          envelope = JSON.parse(stdout) as ClaudeCliEnvelope;
        } catch {
          return fail(
            new Error(`Claude CLI returned non-JSON output: ${snippet}`),
          );
        }
        if (envelope.is_error) {
          const detail = (envelope.result || stderr).slice(
            0,
            CLAUDE_CLI_ERROR_SNIPPET_LENGTH,
          );
          return fail(new Error(`Claude CLI reported an error: ${detail}`));
        }
        settled = true;
        resolve(envelope);
      });

      child.stdin.end(options.prompt);
    });
  }
}
