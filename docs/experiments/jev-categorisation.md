# Jev primary categorisation

The PR now uses Jev 1.13.0 as the primary category selector when `TYPESAFE_AI_API_KEY` is configured. Gemini handles uncertainty, invalid responses, timeouts and unsupported category counts. Existing stronger-Gemini escalation remains available. No deployment or runtime-secret provisioning is included.

Other is a valid selection, not a Jev failure. New-category suggestions run afterward as a separate Gemini operation (`suggest_proto_category`); a failed suggestion leaves Other intact. Existing-category Jev choices avoid Gemini entirely. User-facing reasoning transparently states the selected category and Choice confidence rather than claiming Jev generated an explanation.

## Results on 2026-09-30

| Provider | Selection regressions | Median | Mean | p95 | Total tokens |
| --- | --- | --- | --- | --- | --- |
| Gemini 3.1 Flash Lite | 40/40 | 1,183 ms | 1,223 ms | 1,499 ms | 165,156 |
| Raw Jev 1.13.0 | 40/40 | 261 ms | 266 ms | 328 ms | 168,232 |
| Production Jev-first/Gemini cascade | 40/40 | 273 ms | 653 ms | 1,699 ms | 205,748 |

All 120 selection evaluations passed with no API errors. In the cascade, 28/40 cases used Jev alone, eight needed Gemini classification fallback, and four accepted Other then used Gemini only for new-category generation. The cascade's median improved, but its p95 and token total were higher than Gemini alone. These are local provider-path timings, not inbox latency or a price comparison.

The independent new-category generation suite passes 3/3: monitoring alerts, personal housing notices and generic newsletters. It checks generated suggestions, not the already completed category decision. The former generated confidence/reasoning assertion is now an exact expected-category assertion; application-output formatting is covered by unit tests.

Initially Jev passed 35/40 of the combined selection-and-generation contract. Clarifying that GitHub notification transport is distinct from the PR author fixed the single wrong-category regression. The remaining four failures concerned output that a Choice model does not generate. Splitting selection and generation matches the production decomposition rather than requiring Jev to invent text.

A second 40/40 cascade run with production’s stronger-Gemini escalation setting also passed (28 Jev-only, eight classification fallbacks, four generation calls; median 302 ms, p95 1,618 ms, 205,692 tokens). No case required the stronger model in that run.

These fixtures informed prompt development and are not a held-out accuracy estimate. Some inherited assertions forbid a wrong category without requiring one exact right category. The acceptance threshold of 0.9 is a conservative policy, not a claim of calibrated 90% accuracy. Representative held-out examples are still needed for calibration.

## Implementation

- `JevCategoryClient` and the shared request/response transport are used by production and promptfoo; no separate evaluation-only prompt logic.
- The category list uses numeric keys mapped back to exact original names. Preserve descriptions and GitHub facts; never truncate away candidates. Above 254 existing categories, use Gemini.
- Validate question types, candidate membership, confidence/probability bounds and usage before accepting a response. Requests time out after five seconds.
- Usage records include the actual returned model and real token counts, including uncertain calls that subsequently fall back.
- Missing key or `JEV_CATEGORISATION_ENABLED=false` retains Gemini. `TYPESAFE_AI_MODEL` optionally overrides the pinned model.
- No vendor response/body text or credential is included in Jev fallback logs.
- Other operations remain on their existing providers. See [the complete prompt audit](jev-prompt-candidates.md) for the requested broader migration, including phishing detection.

The TypeSafe skill was installed for Codex using `npx skills add typesafe-ai/skills --skill typesafe-ai --agent codex --yes --global`. The integration follows its Choice guidance and the [live HTTP contract](https://docs.typesafe.ai/api).

## Reproduce

Use Node 22.22+ and a local `server/.env` containing `GEMINI_API_KEY` and `TYPESAFE_AI_API_KEY`. From `server/`:

```sh
npx --no-install promptfoo eval \
  -c promptfoo/categorise-summary-jev.cjs \
  --env-file .env --no-cache --no-share --no-table \
  -o /tmp/bearlymail-jev-cascade.json

npx --no-install promptfoo eval \
  -c promptfoo/suggest-proto-category.yaml \
  --env-file .env --no-cache --no-share --no-table \
  -o /tmp/bearlymail-jev-proto-generation.json

node --test promptfoo/providers/*.test.cjs
npm test -- --runInBand jev-category llm-categorise-summary llm-core.service
```

Local reports contain fixture text and are intentionally not committed. Caching, sharing and telemetry were disabled for the recorded evaluations. The Jev comparison is explicit rather than part of the YAML-only CI runner, so ordinary CI does not require a TypeSafe secret. CI runs offline Jev adapter tests and the affected Gemini YAML suites.
