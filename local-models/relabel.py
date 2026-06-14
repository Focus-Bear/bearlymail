"""
Relabel threads with a strong LLM to produce higher-quality training labels.

The category and priority labels in the export come from a cheap LLM and the
error analysis suggests they are noisy — especially across the near-duplicate
categories where the cheap model picks inconsistently. This tool re-derives the
**category** label for each thread with a strong model, choosing from the user's
canonical taxonomy (loaded from the settings export).

It does the data plumbing only — preparing batches the labeller reads and
scoring the results. The labelling itself is done by a strong model (run as
subagents / a workflow over the prepared batches), which returns, per thread,
the index of the best-fitting category. Indices (not the long category strings)
are returned so the mapping back is exact and parsing-error-free.

Flow:
    prepare_run(export, settings, outdir, sample_n=None)  -> writes:
        taxonomy.txt        numbered canonical categories (the choices)
        batch_000.json ...  threads to label: {threadId, subject, sender, snippet}
        manifest.json       run metadata
    # ... a strong model labels each batch -> labels_000.json: {threadId: index}
    load_labels(outdir)     -> {threadId: category}
    score(relabeled, threads)  -> agreement + churn vs the cheap-LLM labels
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from config import BODY_SNIPPET_CHARS, OTHER_CATEGORY
from dataset import Thread, load_threads

# Index used in the numbered taxonomy for "no category fits".
OTHER_INDEX = 0


def load_taxonomy(settings_path: str) -> list[str]:
    """Canonical category names from the settings export, sorted for a stable
    numbering. Index 0 is reserved for Other (see `numbered_taxonomy`)."""
    with open(settings_path, encoding="utf-8") as f:
        settings = json.load(f)
    cats = sorted(
        c["contextValue"]
        for c in settings.get("contexts", [])
        if c.get("contextKey") == "EMAIL_CATEGORY"
    )
    return cats


def numbered_taxonomy(categories: list[str]) -> str:
    """Render the taxonomy as a numbered list for the labeller. 0 = Other."""
    lines = [f"{OTHER_INDEX}. {OTHER_CATEGORY} (none of the below fit)"]
    for i, cat in enumerate(categories, start=1):
        lines.append(f"{i}. {cat}")
    return "\n".join(lines)


def _thread_payload(thread: Thread) -> dict:
    return {
        "threadId": thread.thread_id,
        "subject": thread.subject,
        "sender": thread.sender_domain,
        "snippet": thread.body[:BODY_SNIPPET_CHARS],
    }


def _sample(threads: list[Thread], sample_n: int | None) -> list[Thread]:
    """Deterministic strided sample across the whole dataset (covers the full
    time range and category mix without randomness)."""
    if sample_n is None or sample_n >= len(threads):
        return threads
    step = len(threads) / sample_n
    return [threads[int(i * step)] for i in range(sample_n)]


@dataclass
class RunManifest:
    outdir: str
    num_threads: int
    num_batches: int
    batch_size: int


def prepare_run(
    export_path: str,
    settings_path: str,
    outdir: str,
    sample_n: int | None = None,
    batch_size: int = 50,
) -> RunManifest:
    os.makedirs(outdir, exist_ok=True)
    categories = load_taxonomy(settings_path)
    with open(os.path.join(outdir, "taxonomy.txt"), "w", encoding="utf-8") as f:
        f.write(numbered_taxonomy(categories))

    threads = _sample(load_threads(export_path), sample_n)
    batches = [threads[i : i + batch_size] for i in range(0, len(threads), batch_size)]
    for b, batch in enumerate(batches):
        with open(os.path.join(outdir, f"batch_{b:03d}.json"), "w", encoding="utf-8") as f:
            json.dump([_thread_payload(t) for t in batch], f, ensure_ascii=False, indent=2)

    manifest = RunManifest(outdir, len(threads), len(batches), batch_size)
    with open(os.path.join(outdir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "num_threads": manifest.num_threads,
                "num_batches": manifest.num_batches,
                "batch_size": manifest.batch_size,
                "num_categories": len(categories),
            },
            f,
            indent=2,
        )
    return manifest


def load_labels(outdir: str) -> dict[str, str]:
    """Read the labeller's `labels_*.json` files ({threadId: index}) and map the
    indices back to category strings via the numbered taxonomy."""
    taxonomy_path = os.path.join(outdir, "taxonomy.txt")
    with open(taxonomy_path, encoding="utf-8") as f:
        lines = [ln.rstrip("\n") for ln in f if ln.strip()]
    index_to_category: dict[int, str] = {}
    for ln in lines:
        num, _, name = ln.partition(". ")
        index_to_category[int(num)] = OTHER_CATEGORY if int(num) == OTHER_INDEX else name

    relabeled: dict[str, str] = {}
    for fname in sorted(os.listdir(outdir)):
        if not (fname.startswith("labels_") and fname.endswith(".json")):
            continue
        with open(os.path.join(outdir, fname), encoding="utf-8") as f:
            for thread_id, idx in json.load(f).items():
                relabeled[thread_id] = index_to_category.get(int(idx), OTHER_CATEGORY)
    return relabeled


def score(relabeled: dict[str, str], threads: list[Thread]) -> dict:
    """Agreement between the strong relabel and the cheap-LLM labels. Low
    agreement = the cheap labels are noisy and worth replacing for training."""
    by_id = {t.thread_id: t for t in threads}
    compared = agree = cheap_other = strong_other = 0
    for thread_id, new_cat in relabeled.items():
        thread = by_id.get(thread_id)
        if thread is None:
            continue
        compared += 1
        old_cat = thread.category
        if new_cat == old_cat:
            agree += 1
        if old_cat == OTHER_CATEGORY:
            cheap_other += 1
        if new_cat == OTHER_CATEGORY:
            strong_other += 1
    return {
        "compared": compared,
        "agreement": agree / compared if compared else 0.0,
        "changed": compared - agree,
        "cheap_other": cheap_other,
        "strong_other": strong_other,
    }
