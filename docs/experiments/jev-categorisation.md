# Jev categorisation trial

Status: approved live evaluation completed on 2026-09-30. Jev is promising for category selection, but is not a drop-in replacement for the full generation contract. Production remains on Gemini.

## Measured results

| Provider/run | Full-contract passes | API errors | Median request latency |
| --- | --- | --- | --- |
| Gemini 3.1 Flash Lite baseline | 40/40 | 0 | 1,186 ms |
| Jev 1.13.0 initial | 35/40 | 0 | 282 ms |
| Jev 1.13.0 with transport/author clarification | 36/40 | 0 | 272 ms |

The initial Jev run misclassified a human-authored merged PR as Bot updates (Choice confidence 0.45). Clarifying that GitHub's notification transport address is distinct from the PR author fixed it on a complete rerun. No remaining wrong-category assertion failures were observed. The same fixtures informed the prompt revision, so this is a regression result, not a held-out accuracy estimate; several inherited checks only forbid one wrong label.

The four remaining failures are deliberately retained:

- Monitoring alert: correctly selected Other, but no generated proto-category suggestion.
- Rent-increase notice: correctly selected Other, but no generated proto-category reasoning.
- Newsletter without a matching category: correctly selected Other, but no generated newsletter proto-category.
- Response-contract case: selected the same category as Gemini, but lacks the application's confidence enum and generated reasoning.

Jev was about 4.4× faster by median provider-call latency in these runs. This is not an end-to-end application benchmark. The final 40 Jev calls used 161,876 input and 7,396 output tokens; costs were not estimated. `jev-latest` resolved to `jev-1.13.0`. All runs disabled Promptfoo caching and sharing, with concurrency 4.

Raw local reports: `/tmp/bearlymail-jev-comparison.json` (80 results: baseline plus initial Jev) and `/tmp/bearlymail-jev-refined.json` (40 revised Jev results). They contain fixture text and are intentionally not committed.

Recommendation: evaluate a Jev-first hybrid with Gemini for Other/new-category suggestions and uncertain decisions. Decide explicitly what explanation to show for accepted Jev choices, calibrate the confidence policy on held-out examples, and test the resulting full application contract before changing production. This PR establishes the comparison rather than silently replacing missing output with invented reasoning.

The TypeSafe skill was installed for Codex with `npx skills add typesafe-ai/skills --skill typesafe-ai --agent codex --yes --global`. This trial follows its Choice guidance and the live API contract at https://docs.typesafe.ai/api: a state object, one category question, and the complete category criteria plus Other. It retains the existing selection rules, GitHub rules and authoritative GitHub facts.

`server/promptfoo/categorise-summary-jev.cjs` loads all 40 cases and unchanged assertions from `categorise-summary.yaml`, comparing the existing Gemini provider against Jev. It is an explicit experiment, outside the YAML-only automatic CI runner, so CI does not unexpectedly require a new credential.

From `server/`, using a Promptfoo-supported Node runtime (the installed version requires Node 22.22+):

```sh
npx --no-install promptfoo eval \
  -c promptfoo/categorise-summary-jev.cjs \
  --env-file .env --no-cache --no-share --no-table \
  -o /tmp/bearlymail-jev-comparison.json
```

The environment file needs `GEMINI_API_KEY` and `TYPESAFE_AI_API_KEY`. Keep credentials local; never include them in result artifacts. For an isolated worktree, pass the original checkout's environment path. To run only Jev, add `--filter-providers jev`; for the baseline, use `--filter-providers google`.

## Interpretation

- Category numbers are returned unchanged, with complete option descriptions preserved. Names containing dashes are never split heuristically.
- Jev returns raw numeric confidence and probabilities. There is deliberately no guessed conversion into the application's HIGH/MEDIUM/LOW labels.
- Jev cannot generate explanations or new-category suggestions. Three Other/proto-suggestion cases and the generated-response contract case therefore cannot fully pass with raw Choice output, even if the category itself is right. Keep these failures visible and distinguish them from wrong-category failures when reviewing the report. Do not interpret the aggregate pass rate as category accuracy alone.
- Some inherited assertions only forbid an incorrect category, rather than requiring the correct one. Inspect the actual selections too; passing the suite alone is insufficient for rollout.
- HTTP errors, malformed responses and absent credentials are errors, not Other decisions or Gemini fallback successes. This trial does not silently fall back, so the report measures Jev itself.
- Record the actual model from response metadata, per-case selections, errors, confidence, token usage and Promptfoo latency. Evaluate a fallback threshold on representative labelled data before translating numeric confidence into application policy.
- A production integration should preserve Gemini for Other/new-category generation and verified uncertainty cases, along with existing error fallback and usage accounting. Build that after quality results justify the switch.

Local verification:

```sh
node --test server/promptfoo/providers/jev-categorisation.test.cjs
```

Five adapter tests pass. Request construction was also checked against all 40 existing cases. These are offline integration checks, not evidence of model quality.
