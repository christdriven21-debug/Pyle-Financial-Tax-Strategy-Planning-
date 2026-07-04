# Fable 5 Deep-Dive Review — Run Guide

> **Status: review executed 2026-07-04.** Results are in `FABLE5-PASS1-REPORT.md`
> (correctness & security) and `FABLE5-PASS2-REPORT.md` (architecture & product,
> incl. the merged 90-day roadmap). The prompt files below are retained so the
> review can be re-run after fixes land.

The review is split into **two sequential passes** so each gets full depth on a
~28k-line codebase, instead of one shallow skim across four tracks.

| Order | File | Covers | Why first/second |
|-------|------|--------|------------------|
| 1 | [FABLE5-PASS1-CORRECTNESS-SECURITY.md](FABLE5-PASS1-CORRECTNESS-SECURITY.md) | Wrong numbers, data leaks, access control, AI-proxy abuse | This is the liability surface — a bad tax number or leaked plan hurts now |
| 2 | [FABLE5-PASS2-ARCHITECTURE-PRODUCT.md](FABLE5-PASS2-ARCHITECTURE-PRODUCT.md) | Monolith decomposition, data-layer versioning, QIR consolidation, product bets | Leverage, not exposure — and it needs Pass 1's findings to sequence the roadmap |

## Protocol

1. Run Pass 1 in Fable 5 with the repo accessible. Save the report.
2. Paste the Pass 1 report into the `APPENDED` section at the bottom of Pass 2's file.
3. Run Pass 2. Its final section merges both passes into one 90-day roadmap.

## Design notes (why the prompts look the way they do)

- **Evidence discipline:** every finding requires `file:line` + a concrete failure
  scenario, and a Confirmed/Plausible confidence label — forces reading, kills
  free-association.
- **Incremental-fix guardrail:** Pass 2 treats "rewrite in a framework" as an
  automatic failure. Recommendations must be executable by a small team with the
  existing no-build workflow, shippable at every step.
- **Blind-spot section:** both passes must end with "what I did NOT verify," so
  you know the review's coverage, not just its findings.
