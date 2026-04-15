# Phase 1: Gate Evaluator — Migration Guide

**Purpose:** Replay these changes against any clean copy of the `core-renewals-platform` repo.
**Source branch:** `experiment/cloudflare`
**Date:** 2026-04-15
**Author:** AI Renewal Platform (James Quigley)

---

## Prerequisites

- Python 3.11+
- Existing data pipeline producing `data/sf_latest.json`, `data/sf_activities_latest.json`
- Existing gate SOQL queries producing `data/sf_gate*.json` (optional — evaluator can work from `sf_latest.json` alone)

---

## Files Added

| File | Purpose |
|------|---------|
| `config/gate_rules.json` | 7-gate framework definition: time windows, required fields, stage mappings, violation thresholds, scenario routing |
| `lib/evaluate_gates.py` | Deterministic gate evaluator. Reads SF JSON data, evaluates every open opportunity against the gate framework, outputs `data/gate_evaluations.json` |
| `docs/MIGRATION.md` | This file |

## Files Modified

| File | Change |
|------|--------|
| `.github/workflows/refresh.yml` | Added `Evaluate Gates` step after SF queries, before Supabase write |

## Files NOT Modified

- `config.json` — existing SOQL queries untouched
- `lib/query_sf_direct.py` — data pull logic unchanged
- `lib/write_to_supabase.py` — Supabase sync unchanged
- `lib/build_dashboard.py` — dashboard build unchanged
- All `src/`, `functions/`, `public/` — application code unchanged

---

## Change Log

### 1. `config/gate_rules.json` (NEW)

Defines the 7-gate framework as a structured JSON config. Each gate specifies:
- `time_trigger_days`: days before renewal date when the gate window opens/closes
- `required_stages`: SF stages that indicate the gate has been passed
- `required_fields`: SF fields that must be populated for the gate to pass
- `violation_conditions`: logic for when a gate is considered violated
- `scenario_routing`: which of the 10 closing scenarios apply at this gate

The gate model replaces the existing SOQL-filter-based approach (gate1_soql through gate4_soql) with a unified state machine evaluation. The existing SOQL queries continue to run for backward compatibility with the dashboard, but the evaluator derives gate status from field state rather than from which SOQL filter an opp matches.

### 2. `lib/evaluate_gates.py` (NEW)

Reads:
- `data/sf_latest.json` (primary — all open opps)
- `data/sf_activities_latest.json` (activity signals)
- `config/gate_rules.json` (gate definitions)

Outputs:
- `data/gate_evaluations.json` — one entry per opportunity with:
  - Current gate position (0-6)
  - Pass/fail/violation status per gate
  - Days until next gate deadline
  - Recommended actions
  - Predicted scenario (1-10)
  - Risk flags

Key design decisions:
- **Read-only**: zero Salesforce writes. All output goes to JSON.
- **Idempotent**: same input data always produces same output.
- **Framework-first**: implements the 7-gate model from the discussion document, not the existing 4-gate SOQL filters.
- **Graceful degradation**: missing fields produce warnings, not crashes.

### 3. `.github/workflows/refresh.yml` (MODIFIED)

Added one step after all SF queries complete:

```yaml
- name: Evaluate Gates
  run: |
    echo "Running gate evaluation..."
    python3 lib/evaluate_gates.py
```

Placed after the last SF query step and before the "Write to Supabase" step.

---

## Replay Instructions

1. Copy `config/gate_rules.json` to `config/`
2. Copy `lib/evaluate_gates.py` to `lib/`
3. Copy `docs/MIGRATION.md` to `docs/`
4. Add the "Evaluate Gates" step to `.github/workflows/refresh.yml` (see diff above)
5. Run: `python3 lib/evaluate_gates.py` — should produce `data/gate_evaluations.json`
6. Verify: `python3 -c "import json; d=json.load(open('data/gate_evaluations.json')); print(f'{len(d[\"opportunities\"])} opportunities evaluated')"`
