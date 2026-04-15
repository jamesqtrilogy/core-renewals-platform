---
name: renewal-opportunity-triage
description: >
  Use this skill whenever the user wants to see their current list of renewal opportunities that need attention — i.e. open, active Salesforce opportunities where the Next Follow Up date is today or earlier, they are the owner, and the deal is not in Legal Dispute. Trigger on phrases like "show me my renewal pipeline", "what opps need follow-up today", "give me my triage list", "which deals are overdue", "list my open renewals due for follow-up", "run the triage", or any similar request for a filtered view of the active renewal pipeline. This skill queries Salesforce live, filters out Legal Disputes, computes days-to-renewal, and produces a prioritised, interactive table with summary metrics. It also generates a compact JSON context block that downstream skills (explicit actions, implicit actions, action consolidation) can consume without re-querying Salesforce.
compatibility: "Requires Salesforce MCP connector"
---

# Renewal Opportunity Triage List

## Purpose

Produce a filtered, prioritised list of the rep's open Salesforce renewal opportunities where action is overdue or due today, stripped of Legal Disputes. This is the entry point for the daily renewal workflow — the output feeds directly into the explicit actions skill, the implicit actions skill, and the action consolidation skill.

---

## Step 0 — Establish today's date

Use the current date as the baseline for all calculations.

> **Date field definitions — critical distinction:**
> - **`Renewal_Date__c` (Renewal Date)** — the contractual start date of the renewal subscription. Day after current contract expiry. Matches the "Start Date" on renewal quotes. Use this for all urgency and deadline calculations.
> - **`CloseDate` (Close Date)** — an internal tracking date, typically set 30 days before the Renewal Date. No contractual weight. Used for pipeline visibility only.

All `days_to_renewal` figures are computed as `Renewal_Date__c − TODAY`. A negative number means the renewal date has already passed.

---

## Step 1 — Query Salesforce

Run a single query to retrieve all qualifying opportunities. This avoids multiple round-trips.

```soql
SELECT Id, Name, Account.Name, StageName, CloseDate, Renewal_Date__c, Amount,
       Next_Follow_Up_Date__c, Legal_Dispute__c, Owner.Name
FROM Opportunity
WHERE Owner.Name LIKE '%[RepLastName]%'  -- replace with the rep's last name, e.g. '%Courtenay%'
  AND IsClosed = false
  AND Next_Follow_Up_Date__c <= TODAY
  AND Legal_Dispute__c = false
ORDER BY Next_Follow_Up_Date__c ASC
LIMIT 100
```

**Field notes:**
- `Next_Follow_Up_Date__c` — the custom field storing the rep's committed next follow-up date
- `Legal_Dispute__c` — boolean; filtering `= false` removes deals that legal owns
- `IsClosed = false` — excludes Closed Won, Closed Lost, and Won't Process
- `Owner.Name LIKE '%[RepLastName]%'` — scoped to the rep running the skill; replace with the appropriate name, or remove the filter entirely to return all open opps for the team

If the query returns 0 results, report that clearly. Do not fabricate records.

---

## Step 2 — Enrich and compute

For each returned opportunity, compute the following derived fields before rendering:

| Derived field | Formula | Example |
|---|---|---|
| `days_to_renewal` | `Renewal_Date__c − TODAY` (integer; negative = renewal date passed) | `-12`, `45`, `112` |
| `follow_up_status` | If `Next_Follow_Up_Date__c = TODAY`: `"due today"` / If `< TODAY`: `"overdue"` | `overdue` |
| `follow_up_overdue_days` | `TODAY − Next_Follow_Up_Date__c` (integer; 0 = due today) | `4` |
| `priority_tier` | See priority logic in Step 3 | `Critical` |

---

## Step 3 — Assign priority tier

Apply this logic to every opportunity to assign a priority tier. Evaluate the conditions in order — assign the first tier that matches.

### Critical
Any of:
- `days_to_renewal` ≤ 3
- `days_to_renewal` < 0 AND `StageName` not in (`Finalizing`, `Closed Won`)
- `StageName = 'Finalizing'` AND `days_to_renewal` ≤ 7

### High
Any of:
- `days_to_renewal` ≤ 30 AND `StageName` not in (`Finalizing`, `Closed Won`)
- `days_to_renewal` ≤ 90 AND `StageName` in (`Outreach`, `Pending`)  *(Gate 2 at risk)*
- `days_to_renewal` ≤ 140 AND `StageName` in (`Outreach`, `Pending`) AND `Amount` ≥ 100000  *(HVO Gate 1 at risk)*
- `follow_up_overdue_days` ≥ 14

### Medium
Any of:
- `days_to_renewal` between 31 and 60
- `follow_up_overdue_days` between 3 and 13

### Monitor
- `days_to_renewal` > 60 AND `follow_up_overdue_days` ≤ 2

---

## Step 4 — Render the output

Produce two outputs: a rendered visual table and a plain-text JSON context block.

### 4a. Summary metrics bar

Before the table, display four headline metrics:
- **Total opps** — count of all records returned
- **Overdue follow-ups** — count where `follow_up_status = "overdue"`
- **Due today** — count where `follow_up_status = "due today"`
- **Total ARR** — sum of `Amount` across all records, formatted as `$X.XM` or `$XXK`

Also display a single line noting how many (if any) opportunities were excluded due to Legal Dispute, e.g.:
> *N opp(s) excluded — Legal Dispute flag set*

If none were excluded, omit this line.

### 4b. Main table

Render an interactive HTML table using the visualiser. Columns:

| Column | Content | Notes |
|---|---|---|
| `#` | Row number | |
| Account | `Account.Name` | Bold |
| Opportunity | `Name` — truncated if > 45 chars | Muted text |
| Stage | `StageName` | Small muted text |
| Priority | `priority_tier` badge | Colour-coded: Critical = red, High = amber, Medium = blue, Monitor = grey |
| Follow-up | `Next_Follow_Up_Date__c` formatted as `DD/MM/YY` + status badge (`overdue` in red, `today` in blue) | |
| Renewal date | `Renewal_Date__c` formatted as `DD/MM/YY` | Muted text; bold red if past |
| Days to renewal | `days_to_renewal` integer | Red if ≤ 30, amber if 31–90, grey otherwise |
| Amount | `Amount` formatted as `$X,XXX,XXX` | Right-aligned |

Sort order: Priority tier (Critical first), then `follow_up_overdue_days` descending within each tier.

### 4c. JSON context block

After the table, emit a fenced JSON block. This is consumed by downstream skills — it must be present on every run.

```json
{
  "generated": "YYYY-MM-DD",
  "total_opps": N,
  "excluded_legal_dispute": N,
  "opportunities": [
    {
      "id": "006...",
      "name": "Full SF opportunity name",
      "account": "Account name",
      "stage": "StageName",
      "close_date": "YYYY-MM-DD",
      "renewal_date": "YYYY-MM-DD",
      "days_to_renewal": N,
      "next_follow_up": "YYYY-MM-DD",
      "follow_up_overdue_days": N,
      "amount": NNNNNN.NN,
      "priority_tier": "Critical|High|Medium|Monitor",
      "is_hvo": true|false
    }
  ]
}
```

**`is_hvo`** is `true` if `Amount ≥ 100000`, otherwise `false`.

Emit this block as a collapsed `<details>` section in the output with the summary label "Context block for downstream skills — click to expand". This keeps the output clean while making the data accessible.

---

## Step 5 — Post-render note

After the table and context block, add a brief plain-text note (2–4 sentences max) highlighting:
- The single most time-critical item and why
- Any pattern worth flagging (e.g., "5 of the 8 High priority opps are HVOs with no quote sent at < 90 days")

Do not repeat information already visible in the table. This note is for rapid orientation only.

---

## Handling edge cases

**No results returned:** Report clearly — "No open opportunities with follow-up due today or earlier were found for [Rep Name]." Do not render an empty table.

**Salesforce connection failure:** Report the error message. Do not fabricate data or use cached results from a previous run.

**Amount field is null:** Treat as `0` for ARR totals and `is_hvo = false` for classification. Note any records with null Amount in the post-render note.

**Duplicate accounts:** Multiple opps for the same account (e.g., co-termed products) are listed individually — do not collapse. Add a note in the post-render section flagging the co-termed group so they can be managed together.

---

## Design principles

**Live data only.** This skill always queries Salesforce fresh. It never uses cached or hardcoded data. The value of the triage list depends entirely on it reflecting the current state of the pipeline.

**Deterministic output.** The same Salesforce data should always produce the same table. Priority logic is rule-based, not judgement-based — leave the judgement to the downstream skills.

**Minimal noise.** The table answers one question: "What do I need to act on today?" Everything else belongs in downstream skills. Do not add commentary on individual deals, suggested emails, or action items here — that is the job of skills 2, 3, and 4.

**The context block is not optional.** Always emit it, even if the user did not explicitly request it. It is the connective tissue between this skill and the downstream pipeline.
