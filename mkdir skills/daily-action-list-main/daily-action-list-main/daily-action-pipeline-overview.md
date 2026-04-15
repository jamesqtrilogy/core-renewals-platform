# Daily Action Pipeline — Overview

## What is this?

The Daily Action Pipeline is a four-skill workflow that helps Enterprise Renewal Managers start each day with a clear, prioritised list of actions across their entire renewal portfolio. It works by querying Salesforce and Gmail live, assessing each deal against the Enterprise Renewals playbook, and producing a single consolidated action list per opportunity — ready to act on without further processing.

The pipeline is designed to be run in sequence, but each skill also works standalone if you only need part of the output.

---

## The four skills

### Skill 1 — Renewal Opportunity Triage (`renewal-opportunity-triage`)

The entry point. Queries Salesforce for all open opportunities where the rep's next follow-up date is today or earlier, filters out Legal Disputes, and renders a prioritised table showing every deal that needs attention.

Each deal is assigned a **priority tier** (Critical / High / Medium / Monitor) based on days to renewal, deal stage, follow-up overdue days, and ARR. The output also includes a **JSON context block** — a compact machine-readable summary of every opportunity — which is passed automatically to Skills 2, 3, and 4 so they don't need to re-query Salesforce from scratch.

**Trigger phrases:** "show me my renewal pipeline", "what opps need follow-up today", "give me my triage list", "run the triage"

---

### Skill 2 — Explicit Actions (`renewal-explicit-actions`)

Reads the paper trail for each opportunity — Salesforce tasks, call notes in the opportunity Description, NextStep field, event logs, and Gmail threads — and extracts every committed, outstanding action that was actually said or written down.

The key distinction: explicit actions are things that were stated. A promise made on a call, an open Salesforce task, a customer ask that was acknowledged but not resolved. This skill does not infer what *should* happen — that is Skill 3's job.

Each action is attributed to an owner (rep, customer, or internal team), prioritised (🔴 High / 🟡 Medium / 🟢 Low), and sourced back to the specific email or Salesforce record it came from.

**Trigger phrases:** "what are the explicit actions for \[customer\]", "what did we commit to on \[opp\]", "find outstanding actions for \[account\]"

---

### Skill 3 — Implicit Actions (`renewal-implicit-actions`)

Assesses each deal against the Enterprise Renewals Cadence Reference Card and identifies the actions the playbook *requires* that have not yet been committed to.

Where Skill 2 extracts, Skill 3 reasons. It checks gate compliance (Gate 1 at T-140, Gate 2 at T-90, Gate 3 at T-30, Gate 4 at T-0), assesses NNR and auto-renewal clause risk, verifies HVO-specific prep requirements, evaluates churn risk signals, and checks whether Platinum/Prime has been pitched at the right point in the cycle. Every action it generates cites the specific playbook rule that produces it.

The skill reads a local reference file — the **Cadence Reference Card** — at the start of every run. This file is the authoritative source for gate definitions, milestone timings, NNR logic, and churn signal taxonomy.

**Trigger phrases:** "where are my deals against the playbook", "is this deal on track", "assess cadence for my triage list"

---

### Skill 4 — Action Consolidation (`renewal-action-consolidation`)

The final step. Takes all the explicit actions from Skill 2 and all the implicit actions from Skill 3, merges them, de-duplicates overlaps, sequences them by dependency, and produces one clean, dated, categorised action list per opportunity — ready to work from directly.

The output is a deal card for each opportunity showing: a header with key deal metrics, a direct Salesforce link, and a structured action table sorted by priority and grouped by category (Customer Commitment Chase, Commercial, HVO Prep, Legal/AR, Internal, Admin). At the end it produces a **Today's Focus** section — a brief, plain-English list of the 3–5 most time-sensitive actions across the entire portfolio.

**Trigger phrases:** "give me the full action list for \[customer\]", "consolidate my actions for \[opp\]", "what do I need to do today for my renewals", "final action list for my triage"

---

## How the pipeline connects

The skills are designed to pass data forward through a **context block** — a JSON object that each skill appends to and the next skill consumes. This means:

- Skill 1 queries Salesforce for the triage list and emits a context block with deal metadata for every opp.  
- Skill 2 reads that block, enriches it with explicit action signals (blocking actions present, legal case open, last customer contact date, etc.), and emits an updated block.  
- Skill 3 reads the enriched block, adds implicit action signals (gate compliance, churn risk level, NNR deadline, overall health), and emits the fully enriched block.  
- Skill 4 reads the fully enriched block and consolidates everything into the final output.

At each stage, the context block is rendered as a collapsed section in the output (click to expand). This keeps the conversation readable while preserving the data for downstream steps.

If you run the skills in sequence in the same conversation, data flows automatically — you do not need to do anything to pass the context between steps.

---

## Running the full pipeline

The fastest way to get a complete daily action list is to run all four skills in sequence by asking:

1. "Run the triage" → Skill 1 produces the priority table and context block  
2. "Run explicit actions for my triage list" → Skill 2 processes every opp in the context block  
3. "Assess cadence for my triage list" → Skill 3 checks every opp against the playbook  
4. "Give me the final action list for my triage" → Skill 4 consolidates everything

You can also run Skills 2–4 on a single opportunity at any time by providing the opportunity name or Salesforce URL, without needing to run Skill 1 first.

---

## Running skills standalone

Every skill in the pipeline can be invoked independently:

- **Skill 1** always runs standalone — it is the entry point.  
- **Skills 2, 3, and 4** can run on a single opportunity by name or Salesforce URL, without the context block from Skill 1\.  
- When running standalone, Skills 2 and 3 query Salesforce and Gmail directly. Skill 4 in standalone mode runs a lightweight inline assessment rather than consuming upstream output.

The tradeoff: running the full pipeline in sequence gives deeper output than running any individual skill standalone, because upstream context signals (e.g., "blocking action present", "churn risk level") enrich the downstream assessments.

---

## Prerequisites

| Requirement | Details |
| :---- | :---- |
| Salesforce MCP connector | Required by all four skills. Must be authenticated and able to query `Opportunity`, `Task`, `Event`, and `OpportunityContactRole` objects. |
| Gmail MCP connector | Required by Skill 2 only. Used to search and read email threads with customer contacts. |
| Cadence Reference Card | Required by Skill 3\. Must be present at `/mnt/skills/user/renewal-implicit-actions/references/cadence-reference-card.md`. If missing, Skill 3 will halt and display an error. |
| User identity | Skills query Salesforce using the rep's last name to filter opportunities to their pipeline. The rep's name must match the `Owner.Name` field in Salesforce. |

---

## File structure

```
renewal-opportunity-triage/
└── SKILL.md

renewal-explicit-actions/
└── SKILL.md

renewal-implicit-actions/
├── SKILL.md
└── cadence-reference-card.md   ← must be present for Skill 3 to run

renewal-action-consolidation/
└── SKILL.md
```

---

## Design principles

**Live data only.** The pipeline always queries Salesforce and Gmail fresh. It never uses cached data. The value of the output depends entirely on it reflecting the current state of each deal.

**Explicit and implicit are separate.** Skill 2 extracts what was said. Skill 3 infers what the playbook requires. They are kept separate until Skill 4 merges them, so the source of every action is always traceable — either to a specific email or Salesforce record, or to a specific playbook rule.

**The context block is the connective tissue.** Every skill emits an enriched context block even if the user did not ask for it. Without this block, downstream skills lose the efficiency of batch processing and must re-query Salesforce independently.

**Don't fabricate.** If Salesforce returns zero results, the triage reports that clearly. If an action cannot be sourced, it is excluded. If the Cadence Reference Card is missing, Skill 3 halts rather than guessing.  
