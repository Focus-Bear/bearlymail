# Jev prompt audit

Audited the current prompt files and their output contracts on 2026-09-30. Only category selection is implemented and live-evaluated in this PR so far. Broader production routing is pending approval for sending bodies, drafts, transcripts, user context, rules and workflow data to TypeSafe. The entries below describe the intended decomposition, not completed migrations or measured accuracy.

Jev returns typed judgments, not generated prose. Existing category selection now uses Jev first, with Gemini fallback on uncertainty or failure. Other remains a valid choice; suggesting a new category is a separate Gemini operation. The same principle applies to the remaining prompts: keep exact lookups, dates, arithmetic and execution in code; use Jev for judgments; keep Gemini for generated text and uncertain judgments.

## Bounded decisions

| Prompt | Jev implementation shape | Contract and validation requirements |
| --- | --- | --- |
| `categorise-summary.md` | Implemented: Choice over exact existing categories plus Other | Shared production/evaluation helper. Accept Choice confidence ≥0.9; otherwise Gemini. |
| `categorise-summary-jev.md` | Implemented: dedicated Choice policy | Inlines both shared policy fragments, preserves GitHub facts and actor identity. |
| `check-phishing-only.md` | Choice: legitimate, phishing, insufficient evidence | Jev primary; uncertain/error → Gemini. Keep `confirm_phishing` on independent Gemini to avoid having the same model confirm itself. Preserve known ESP/link evidence rules and evaluate false positives as well as attacks. A static Jev verdict must not pretend to be a generated explanation. |
| `check-category-duplicate.md` | Choice over existing exact category IDs plus none | Pass ordered candidates as typed metadata; do not recover identity from prose. Test related-but-distinct categories. |
| `classify-contact-type.md` | Choice over all eight contact types | Preserve lead/customer/team/advisor/stranger/bot/partner/spammer distinctions and downstream confidence semantics. |
| `classify-email-type.md` | Four independent Nouls, personalization Score, urgency Choice | Automated, newsletter, cold outreach and out-of-office can overlap. Replace reasons with honest verdict statements or obtain Gemini explanations separately. |
| `detect-opt-out.md` | Noul: asks to stop automated replies | P(yes) is not independent confidence. Ambiguity must fall back, not silently become no opt-out. |
| `verify-distraction-phrase.md` | Noul over transcript and target meaning | Cover paraphrases, unrelated speech and transcription errors. |
| `check-custom-exclusion-rules.md` | Choice over exact rules plus no match | Return the original selected rule; never invent rule text. Test first/any matching rule semantics at both call sites. |
| `batch-priority-triage.md` | Independent Noul per thread | Use exact thread keys supplied by code. Uncertain/missing answers must cause analysis, not skipped work. |
| `incremental-priority-check.md` | Nouls for recalculation and category change; Score for urgency delta | Map ordered levels in code to the bounded -30..30 delta. Validate downstream skip behaviour. |
| `prioritise-email.md` | Independent urgency and goal-alignment Scores | Preserve the already assigned category. Keep explicit zero-urgency newsletter policy, deadlines and user context. Numeric levels need behavioural validation; generated rationales cannot be fabricated. |
| `derive-mcp-sender-tool.md` | Choice over valid tool/email-argument pairs plus none | Construct candidates from schemas; copy exact names. Selection alone must not execute a tool. |
| `merge-duplicate-categories.md` | Noul per candidate pair | Conservative grouping in code; do not assume transitive equivalence or merge broad-but-related categories. Preserve exact canonical/member names. |
| `search-ranking.md` | Per-candidate relevance Score | Promptfoo-only contract currently. Calculate recency adjustments, bounds and sorting in code; return all original indexes. Resolve the prompt's contradictory include-all vs filter requirements at the consumer boundary. |

The inline natural-language condition in `workflow-execution.service.ts` is another Jev Noul candidate (`evaluate_workflow_condition`), even though it is not a prompt file. Retain Gemini fallback and explicitly test its existing error behaviour before switching.

## Mixed decision and generation contracts

| Prompt | Work Jev can handle | Work still requiring generation or source-candidate construction |
| --- | --- | --- |
| `sanity-check-category-rule.md` | Accept/reject/revise Choice | Corrected rules, alternative category names and explanations. An accepted unchanged rule can return directly; revisions go to Gemini. |
| `assess-category-rule-value.md` | Separate sense/value/exclusion-needed judgments | Suggested exclusion phrases and user-facing explanations. |
| `check-tone-style.md` | Separate tone, attachment, timing and recipient-mismatch judgments | Rewrites and specific suggestions. A no-change gate must check every independent warning, not only tone. |
| `dispute-tone-check.md` | Accept/reject and exact existing-rule selections | Explanation and any new rule text. Never remove an unselected rule. |
| `validate-writing-example.md` | Eligibility judgment | Cleaning/redacting valid examples. Invalid inputs can be rejected directly with an honest fixed reason. |
| `detect-meeting-proposal.md` | Proposal-presence and booking-invitation Nouls | Date/time/topic extraction. Day-only proposals count; booking-link invitations are independent. Return empty details directly only when both are absent. |
| `extract-meeting-date-references.md` | Judge deterministic date-span candidates as meetings with recipient | Use the existing date parser to construct and resolve spans in the user's timezone, then copy source phrases. Candidate coverage and relative-date semantics need tests before replacing the current extractor. |
| `derive-rule-exclusions.md` | Select useful exclusion phrases from source candidates | Construct bounded ngrams from false positives, excluding true-positive matches; preserve phrase-length constraints. Do not ask Jev to invent strings. |
| `suggest-category-rules.md` | Validate/score proposed rules and select available sender/domain/topic candidates | Open-ended condition discovery and rule descriptions still need Gemini until candidate coverage is demonstrated. |
| `identify-custom-labels.md` | Select useful custom labels after deterministic system-label filtering | Cleaned names, emoji prefixes and descriptions. |
| `suggest-actions.md` | Independent action-eligibility judgments | Optional action titles, descriptions and free-form metadata. Preserve each action's required parameters; no action execution follows merely from a prediction. |
| `extract-action-items.md` | Gate whether actionable items exist | Task paraphrases, assignees and deadline extraction; use generation when items exist. |
| `incremental-summary.md` | Contact-type judgment and whether an update is material | Updated summary prose; avoid dropping material updates through an unvalidated gate. |
| `summarize-email-tldr.md` | Structured sentiment/meeting/contact judgments within the output | TL;DR prose. Splitting decisions must preserve all consumers and account for the extra calls. |
| `summarize-email-bullets.md` | Structured metadata judgments | Bullet text. |
| `summarize-email-actions.md` | Structured metadata judgments | Action-focused summary prose. |
| `summarize-email-batch.md` | Per-thread structured judgments | Summaries for each exact thread key. |
| `summarize-email-custom.md` | Applicable structured judgments | User-defined summary formats and prose. |
| `redact-names.md` | Select/name-type judgments over detected entity spans | Reliable span detection and exact replacement in code; the current unbounded extraction cannot be replaced with a single Choice. |

## Generation remains necessary

| Prompt | Reason |
| --- | --- |
| `suggest-proto-category.md` | Creates a new category name, description and reasoning after Other. Separate generation regression suite. |
| `generate-categories-from-other.md` | Discovers and describes new groups from Other mail. Jev can validate generated candidates afterward. |
| `consolidate-email-categories.md` | Broader restructuring and new descriptions, unlike exact duplicate selection. |
| `discover-user-context.md` | Discovers previously unknown goals, contacts, projects and context text. |
| `compress-user-context.md` | Rewrites context while retaining salient information. |
| `analyze-priority-feedback.md` | Learns and writes new preference/context statements. |
| `extract-common-questions.md` | Produces generalised questions and answers from threads. |
| `generate-reply.md` | New reply prose. |
| `generate-multiple-replies.md` | Multiple distinct reply drafts. |
| `generate-meeting-reply.md` | Scheduling reply prose. |
| `generate-follow-up.md` | Follow-up prose. |
| `generate-qa-answer.md` | Personalised answer text grounded in the knowledge base. |
| `generate-booking-title.md` | Concise novel meeting title. |
| `ask-ai-email.md` | Open-ended answers and drafts grounded in the current email. |
| `ask-ai-agent.md` | Open-ended dialogue and multi-step tool planning; individual bounded decisions may be extracted, but not the entire agent contract. |
| `search-query-conversion.md` | Promptfoo-only open-ended Gmail query construction. A deterministic parser plus selected spans is possible only with adequate grammar/candidate coverage. |
| `search-relevance-explanation.md` | User-facing explanation connecting query to evidence. |

`_shared/category-selection-rules.md` and `_shared/category-github-rules.md` are policy fragments, not standalone model calls. Both are already incorporated in the Jev category question.

## Inline prompts and other model calls

The file inventory alone is insufficient: these prompts are embedded in services and also need consideration before claiming a complete migration.

| Location | Decision |
| --- | --- |
| `summarization/summarization.helpers.ts` rule selection | Direct Choice over exact summarisation rules plus none. Strong Jev candidate; add an explicit operation ID and typed candidates rather than route by prompt text. |
| `priority/triage-suggestions.service.ts` triage action | Choice for 0–3 stars plus independent archive Noul. Compute baseline stars from priority in code; evaluate historical-pattern overrides. |
| `auto-responder/email-classifier.service.ts` inline custom exclusion fallback | Same exact-rule Choice as the file prompt; migrate both paths together. |
| `emails/email-search-ranking.service.ts` ranking (two call sites) | Actual production ranking is inline, while `search-ranking.md` is the test template. Share one Jev per-candidate Score implementation across both, with code-owned recency and filtering. |
| `emails/email-search-ranking.service.ts` query conversion and alternative queries | Remain generative; the file-based conversion prompt is currently test-only. |
| `workflows/workflow-execution.service.ts` conditions | Noul plus Gemini fallback; preserve execution boundary and failure semantics. |
| `workflows/workflow-variable-resolver.ts` variable resolution | Arbitrary user-written extraction tasks return strings; retain Gemini unless the variable schema offers bounded source candidates. |
| `follow-ups/follow-ups.service.ts` draft cleanup | Generative prose, retain Gemini. |
| `summarization/summarization.service.ts` and `llm-summarization.service.ts` custom/thread summaries | User-specified prose transformations, retain generation; structured judgments can be split. |
| `llm-search.service.ts` single/batch explanation wrappers | Prose explanations using the shared template; retain generation. |
| `category-shortlist.service.ts` | Uses embeddings and deterministic similarity sorting, not a chat prompt. No Jev migration required; it currently retains all candidates by default. |

The audit also found a concrete existing bug: `identifyCustomLabels` sent the literal prompt ID rather than the template and label list, and the template was absent from the prompt registry. This PR registers and renders it correctly with an offline regression test. Its generative provider is unchanged.

## Migration checks

For each subsequent adapter, reuse production request/output code in promptfoo. Measure raw Jev and the actual Gemini fallback path independently; record fallback frequency, combined latency, token usage and API errors. Add malformed-response, timeout, threshold-boundary and missing-key tests. Do not treat concentrated probabilities as proof of correctness or permission to perform actions. Category fixtures are regressions used during tuning, not a held-out accuracy estimate.
