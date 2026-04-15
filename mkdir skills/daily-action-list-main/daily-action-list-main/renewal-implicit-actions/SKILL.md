---
name: renewal-implicit-actions
description: >
  Use this skill to assess the playbook compliance and cadence health of one or more Salesforce renewal opportunities, and identify the actions needed to get each deal back on track. Trigger on phrases like "where are my deals against the playbook", "what stage should this opp be at", "is this deal on track", "what implicit actions do I need to take for [customer]", "assess cadence for my triage list", "what does the playbook say I should be doing on [opp]", or any request to evaluate renewal progress against the Enterprise Renewals cadence targets. Also triggers automatically as Step 3 in the full triage pipeline. Scoped to a single opportunity per invocation when run standalone; processes a batch when fed the enriched context block from the explicit actions skill. Does not extract committed actions from the paper trail — that is the job of the explicit actions skill (Skill 2). Requires the Cadence Reference Card to be available at /mnt/skills/user/renewal-implicit-actions/references/cadence-reference-card.md.
compatibility: "Requires Salesforce MCP connector. Gmail not required — this skill reasons from Salesforce data and the Cadence Reference Card only."
---

# Renewal Implicit Actions Skill

## Purpose

Assess how far each opportunity is from where the playbook says it should be, and produce a concrete list of actions needed to close that gap.

The distinction that defines this skill: **implicit actions are things the playbook requires that have not yet been said or committed to** — gaps between the deal's current state and its expected state at this point in the renewal cycle. They are inferred from the cadence, not extracted from the paper trail. Extraction belongs to the explicit actions skill (Skill 2).

---

## Reference document

This skill depends on the **Enterprise Renewals Cadence Reference Card**, located at:

```
/mnt/skills/user/renewal-implicit-actions/references/cadence-reference-card.md
```

**Read this file at the start of every run before assessing any opportunity.** Do not rely on memory or prior context for gate definitions, milestone timings, pricing rules, NNR logic, or churn signals — always read the card fresh. The card is the authoritative source; if anything in the conversation conflicts with the card, the card takes precedence.

If the file is not found at that path, halt and tell the user: "The Cadence Reference Card is missing from the expected location. Please ensure it is saved at `/mnt/skills/user/renewal-implicit-actions/references/cadence-reference-card.md` before running this skill."

---

## Input modes

### Mode A — Single opportunity (standalone)
The user provides one opportunity by name, Salesforce URL, or Salesforce ID. Retrieve the opportunity data from Salesforce and assess it against the cadence.

### Mode B — Batch from enriched context block
The explicit actions skill (Skill 2) has already run and produced an enriched context block containing opportunity metadata plus `explicit_actions` signals (`blocking_action_present`, `legal_case_open`, `quote_unsigned`, `days_since_last_customer_contact`, etc.). In this mode, use the context block data directly — do not re-query the fields already present. Only query Salesforce for fields not in the context block (primarily `Description` and `NextStep`, which are needed to detect churn signals and AR/NNR status).

**If an enriched context block is present in the conversation, default to Mode B.** Do not ask the user which mode to use — infer it.

---

## Step 0 — Read the Cadence Reference Card

Read the full reference card before proceeding. The sections you will use most are:

- **Section 2** — The full renewal lifecycle timeline (milestone days and owners)
- **Section 3** — Gate definitions and failure protocols
- **Section 4** — Salesforce stage definitions and the stage vs. gate alignment table
- **Section 6** — NNR rules and deadline calculation formula
- **Section 8** — Extension policy
- **Section 9** — Churn risk signals
- **Section 13** — Priority assessment logic

---

## Step 1 — Retrieve opportunity data from Salesforce

> **Date field definitions — critical distinction:**
> - **`Renewal_Date__c` (Renewal Date)** — the contractual start date of the renewal subscription. Day after current contract expiry. Matches the "Start Date" on renewal quotes. Use this for all cadence, gate, and NNR deadline calculations.
> - **`CloseDate` (Close Date)** — an internal tracking date, typically set 30 days before the Renewal Date. No contractual weight. Do not use for deadline or urgency calculations.

### Mode A — Full retrieval

```soql
SELECT Id, Name, StageName, CloseDate, Renewal_Date__c, Amount, Description, NextStep,
       Account.Name, AccountId, Next_Follow_Up_Date__c,
       Owner.Name, OwnerId
FROM Opportunity
WHERE Id = '[OppId]'
LIMIT 1
```

Also retrieve open tasks to check for active Gate-related tasks:

```soql
SELECT Id, Subject, Status, ActivityDate, Owner.Name
FROM Task
WHERE WhatId = '[OppId]'
  AND Status != 'Completed'
ORDER BY ActivityDate ASC
LIMIT 20
```

### Mode B — Supplemental retrieval only

The context block already contains: `id`, `name`, `account`, `stage`, `close_date`, `renewal_date`, `days_to_renewal`, `amount`, `is_hvo`, `priority_tier`, and all `explicit_actions` fields.

Only query Salesforce for:

```soql
SELECT Id, Description, NextStep
FROM Opportunity
WHERE Id = '[OppId]'
LIMIT 1
```

Use `Description` and `NextStep` to detect: churn signals, AR/NNR status flags, "Likely to Churn" notations, toxic clause flags, and any migration language. Do not re-fetch fields already in the context block.

---

## Step 2 — Compute cadence position

For each opportunity, compute the following before running any assessments:

| Computed value | How to derive it |
|---|---|
| `days_to_renewal` | `Renewal_Date__c − TODAY` (integer; negative = renewal date passed) |
| `is_hvo` | `Amount ≥ 100000` OR manually flagged in SF (check Description for "Treat as High Value") |
| `expected_stage` | Look up in Section 4 of the Cadence Reference Card using `days_to_renewal` |
| `actual_stage` | `StageName` from Salesforce |
| `stage_gap` | Compare `actual_stage` to `expected_stage` — behind / on track / ahead |
| `gate_at_risk` | Identify which gate (1, 2, 3, or 4) is the next to be triggered, and whether it will be missed at the current trajectory |
| `ar_clause_present` | Detect in Description: look for "Auto-renewal - Y", "AR clause", "Has Auto Renewal Clause" |
| `notice_period_days` | Extract from Description HVO Prep notes (typically 60 or 90 days; default to 60 if not found) |
| `nrn_deadline` | If `ar_clause_present`: compute `Renewal_Date__c − notice_period_days − 15` |
| `days_to_nrn_deadline` | `nrn_deadline − TODAY` (if applicable) |
| `churn_risk_level` | None / Low / Medium / High — see Step 3 |
| `toxic_ar_clause` | Detect in Description: look for "TOXIC", "price cap", "flat rate renewal", "NNR required" language from HVO Prep notes |

---

## Step 3 — Assess churn risk

Read the `Description` field carefully for churn signals defined in Section 9 of the Cadence Reference Card. Assign a churn risk level:

### High churn risk — any of:
- Description contains "Likely to Churn", "LIKELY TO CHURN", or "at risk" notation
- Customer is actively migrating to another platform (migration language present)
- Customer has explicitly declined renewal terms or requested cancellation steps
- Customer has been silent for > 30 days with no engagement on record (`days_since_last_customer_contact > 30` from context block, or inferred from Description dates)
- Customer insisted on 1-year renewal after a significant price increase

### Medium churn risk — any of:
- Customer has challenged the pricing strongly but has not walked away
- Customer requested a reduction in seats or licenses
- Customer asked "what's on your roadmap?" without follow-through
- Customer has engaged but expressed dissatisfaction with product value
- No upsell or expansion requests despite multiple interactions

### Low churn risk:
- Customer is engaged and responding, no negative signals
- Customer is progressing through the renewal process co-operatively

### No churn signal detected:
- Insufficient data to assess, or deal is very early stage

---

## Step 4 — Run the implicit gap analysis

This is the core assessment. For each opportunity, work through the following five assessment areas in order. For each area, determine: (a) what the playbook requires at this stage, (b) what has actually happened, and (c) what action is needed to close the gap.

### Assessment Area 1: Gate compliance

Using `days_to_renewal`, `actual_stage`, and `expected_stage`:

1. Identify the current phase (Preparation / Engagement / Commercial / Finalisation) from Section 2 of the card.
2. Check whether the actual stage meets the minimum expected stage from the alignment table in Section 4.
3. Identify the next gate, its day marker, and the days remaining until it triggers.
4. Determine whether the deal is on track to pass that gate at its current trajectory.

**Generate actions for any gap found.** Examples:
- If `days_to_renewal ≤ 140` and `actual_stage` is still `Outreach` or `Pending` and `is_hvo = true`: Gate 1 failure — implicit action: escalate PC confirmation to SDR immediately.
- If `days_to_renewal ≤ 90` and no quote has been sent (stage is `Engaged` or `Outreach`): Gate 2 at risk — implicit action: issue quote this week.
- If `days_to_renewal ≤ 30` and `actual_stage` is not `Finalizing`: Gate 3 failure — implicit action: escalate to VP immediately.

### Assessment Area 2: NNR and AR clause status

1. If `ar_clause_present = true` and `toxic_ar_clause = true`:
   - Has the NNR been sent? Check Description for "NNR sent", "NNR case", "notice of non-renewal sent".
   - If not sent: compute `days_to_nrn_deadline`. If ≤ 15: critical action to send NNR now.
   - If not sent and `days_to_nrn_deadline` between 16 and 30: high priority action.

2. If `ar_clause_present = true` and `toxic_ar_clause = false`:
   - Note the AR trigger date (T-30 before renewal). If the deal will not be signed by then, the AR penalty invoice will auto-issue. Flag as an implicit action if `days_to_renewal ≤ 45` and deal is not in Finalizing.

3. If `ar_clause_present = false`:
   - Confirm whether a quote has been sent. Without an AR clause, there is no safety net — if the customer does not sign, the deal is Closed Lost with de-provisioning. Flag this for any deal where `days_to_renewal ≤ 60` and no signed agreement exists.

### Assessment Area 3: HVO-specific requirements

If `is_hvo = true`, check each of the following against the Description and context block:

| HVO requirement | How to detect it is missing | Action if missing |
|---|---|---|
| Warm intro sent via AM | No "warm intro" or "HVO Opp Prep" entry in Description | Request AM warm intro via Account Chatter |
| HVO Opp Prep completed by Sales Ops | No "HVO Opp Prep task completed" entry in Description | Raise with Sales Ops to complete HVO prep |
| Primary Contact confirmed | No confirmed PC email in Description, or `days_since_last_customer_contact` is null | Escalate PC identification to SDR |
| Contract Report generated | No "Contract Report" reference in Description or opp files | Request Sales Ops to generate Contract Report |
| HVO Renewal Plan URL in VP Report field | No VP Report URL noted | Request Sales Ops to complete and link HVO Renewal Plan |
| Legal case raised (if non-standard terms) | No "LEGAL CASE" entry in Description for non-ESW contracts | Raise legal case if contract is not on standard ESW terms |
| Renewal pack complete at T-60 | `days_to_renewal ≤ 60` and no renewal pack reference in Description | Flag as red — renewal pack overdue |

### Assessment Area 4: Churn risk response

If `churn_risk_level` is Medium or High, assess whether the appropriate playbook response has been activated:

**High churn risk — check all of:**
- Has the Three-Alarm escalation framework been used? (Look for evidence of executive escalation in Description)
- Has the customer been directed to cancellations@trilogy.com if they have formally decided to leave?
- Has the churn risk been categorised using the standard taxonomy? (Section 9 of the card)
- If migration is in progress: has an NNR deadline been computed and is it being tracked?
- Is a final call-to-action scheduled before the notice deadline?

**Medium churn risk — check:**
- Has pricing objection handling been attempted using the playbook talk track?
- Has Platinum or Prime been pitched as an alternative to a discount?
- Has a multi-year price-lock been offered?

Generate implicit actions for any response that has not been attempted.

### Assessment Area 5: Platinum and Prime

For every opportunity where `days_to_renewal` is between 60 and 120 and there is no evidence in the Description of a Platinum or Prime pitch:

- Generate an implicit action: pitch Platinum Success and Prime at the next customer interaction.
- If `amount ≥ 1000000` and there is no multi-year offer on record: generate an implicit action to present the 3- or 5-year Platinum pricing (which unlocks the 10% uplift reduction).
- If the customer is receiving a price reset of 45% or more: generate an implicit action to auto-offer Platinum (playbook requirement).

---

## Step 5 — Assign priority to each implicit action

Use the same priority framework as Skill 2, applied to playbook-driven actions:

### 🔴 High
- Gate failure (Gate 1, 2, 3, or 4 has been missed or will be missed within 7 days)
- NNR deadline within 15 days
- HVO at T-60 without a complete renewal pack
- High churn risk with no escalation on record
- Deal will auto-renew at penalty pricing within 30 days if not acted on

### 🟡 Medium
- Gate at risk within 14–30 days at current trajectory
- NNR deadline 16–30 days away
- HVO prep item incomplete at > T-120
- Medium churn risk with no playbook response attempted
- Platinum/Prime not pitched at T-60 to T-120
- Quote not sent within 7 days of Gate 2 window

### 🟢 Low / Watch
- Gate on track but next milestone requires preparation now
- Churn signal present but deal still early stage (> T-120)
- Multi-year/Platinum opportunity not yet presented but `days_to_renewal > 90`

---

## Step 6 — Output format

### Single opportunity (Mode A)

```
## Implicit Actions — [Account Name]
### [Opportunity Name]
*Stage: [actual_stage] | Expected: [expected_stage] | Gap: [Behind / On Track / Ahead]*
*Days to renewal: [N] | Renewal date: DD Mon YYYY | ARR: $[Amount] | HVO: Yes/No*
*Churn risk: [None / Low / Medium / High] | AR clause: [Yes/No] | Toxic AR: [Yes/No]*
*As of: DD Mon YYYY*

---

#### Cadence assessment
[2–3 sentences: plain-English summary of where the deal is against the playbook, which gate is next, and whether it is on track to pass.]

---

#### 🔴 High Priority
| # | Implicit action | Rationale (playbook reference) | Due | Owner |
|---|-----------------|-------------------------------|-----|-------|
| 1 | [Specific action] | [e.g., "Gate 2 at T-90 — quote must be issued"] | [DD Mon YYYY or "immediately"] | [Rep / SDR / Sales Ops / Legal / VP] |

#### 🟡 Medium Priority
| # | Implicit action | Rationale (playbook reference) | Due | Owner |
|---|-----------------|-------------------------------|-----|-------|

#### 🟢 Low / Watch
| # | Implicit action | Rationale (playbook reference) | Due | Owner |
|---|-----------------|-------------------------------|-----|-------|
```

**Key difference from Skill 2:** The "Rationale" column replaces the "Source" column. Every implicit action must cite the specific playbook rule that generates it (e.g., "Gate 1 — T-140 — PC must be confirmed", "NNR formula: renewal date − 60 days notice − 15 days = DD Mon"). This makes the action traceable to the playbook, not just to the rep's judgement.

### Batch run (Mode B)

Repeat the above structure for each opportunity in sequence. Add a top-level summary first:

```
## Implicit Actions — Full Triage Run
*[N] opportunities assessed | Run date: DD Mon YYYY*

### Pipeline health summary
| Gate | Opps at risk | Opps compliant |
|------|-------------|----------------|
| Gate 1 (PC confirmed, T-140) | N | N |
| Gate 2 (Quote sent, T-90) | N | N |
| Gate 3 (Finalizing, T-30) | N | N |
| Gate 4 (Closed, T-0) | N | N |

Churn risk: [N] High / [N] Medium / [N] Low / [N] None
HVO prep gaps: [N] opps with incomplete HVO prep items
NNR deadlines within 30 days: [N] opps
```

Then individual opp sections, separated by horizontal rules.

After all opps, add a **Systemic gaps** note (3–5 sentences) flagging patterns that span multiple deals — e.g., "Gate 2 compliance is the most common gap — 7 opps have no quote sent with < 90 days to renewal", or "4 HVOs have incomplete Sales Ops prep items despite being past T-120."

---

## Step 7 — Emit the final enriched context block (Mode B only)

Append implicit action signals to the context block, so Skill 4 (action consolidation) can consume both explicit and implicit action data without re-running assessments.

Add the following fields to each opportunity object:

```json
{
  "implicit_actions": {
    "high_count": N,
    "medium_count": N,
    "low_count": N,
    "gate_compliance": "on_track|behind|gate_failed",
    "gate_at_risk": "Gate1|Gate2|Gate3|Gate4|none",
    "days_to_next_gate": N,
    "churn_risk_level": "none|low|medium|high",
    "nrn_required": true|false,
    "nrn_deadline": "YYYY-MM-DD or null",
    "days_to_nrn_deadline": N,
    "hvo_prep_complete": true|false,
    "platinum_pitched": true|false,
    "overall_health": "green|amber|red"
  }
}
```

**`overall_health`** is assigned as:
- `red` — any Gate failure, NNR deadline ≤ 15 days, High churn risk, or Gate 4 violation
- `amber` — any Gate at risk within 30 days, Medium churn risk, HVO prep incomplete, or NNR deadline 16–30 days
- `green` — on track, no material gaps identified

Emit the fully enriched context block as a collapsed `<details>` section labelled "Enriched context block for Skill 4 — click to expand".

---

## Handling edge cases

**Deal with a renewal date already past (days_to_renewal < 0):** This is a Gate 4 violation. The primary implicit action is immediate VP escalation and assessment of whether an extension is appropriate. Do not generate cadence-based actions for future milestones — the deal is in breach.

**Stage is ahead of expected (e.g., Finalizing at T-120):** Flag as positive but verify it is legitimate. An early Finalizing stage can indicate a data quality problem (stage moved manually without completing the underlying steps). Note it as a watch item.

**No AR clause and no quote sent at < 30 days to renewal:** This is the highest-risk scenario — no safety net. Flag as Critical. The only options are: get a quote signed immediately, or pursue an extension through the VP approval process.

**Churn signals present but deal is early stage (> T-120):** Churn at this stage is a warning, not a crisis. Generate medium-priority actions focused on value reinforcement and MEDDPICC qualification rather than emergency escalation.

**Opp description is sparse or very short:** If the Description field is less than 200 characters or contains only system-generated entries, note that the assessment is limited due to insufficient activity data, and recommend the rep review and update the Description as a first action.

**Multiple products, one account (co-termed opps):** Assess each opp independently. However, note in the cadence assessment that the opps should be managed as a co-termed set and that commercial actions should be coordinated across them to avoid sending conflicting signals to the customer.

---

## Core principles

**Every action must cite a playbook rule.** The value of implicit actions is that they are grounded in the cadence, not in opinion. If you cannot point to a specific gate, milestone, or rule in the Cadence Reference Card that generates an action, do not include it. Vague "best practice" suggestions do not belong here.

**Be precise about timing.** Where the playbook specifies a day marker (T-90, T-60, T-30), convert it to a calendar date using `Renewal_Date__c`. Always express deadlines as actual dates, not just day counts. A rep reading "by 2 May" can act on it; "by T-60" requires a calculation they may not make.

**Distinguish between gate failure and gate at risk.** A gate that has already been missed is a failure — it needs immediate escalation. A gate that will be missed in 14 days at the current trajectory is at risk — it needs action this week. These are different urgency levels and must be communicated differently.

**Never overlap with Skill 2.** If an action was already captured by the explicit actions skill (it was written down or committed to), do not repeat it here. The implicit actions list contains only what the playbook requires that has not yet been said. In a batch run, use the `explicit_actions` context block fields to avoid duplication — if `blocking_action_present = true` and the block describes the same action the cadence would generate, skip it.

**Churn risk governs the cadence response.** A deal with High churn risk at T-90 does not follow the same path as a cooperative renewal at T-90. Adjust the implicit actions accordingly — a High churn risk deal needs an escalation and a final call-to-action, not a standard quote follow-up. Read the churn risk level before generating commercial-phase actions.
