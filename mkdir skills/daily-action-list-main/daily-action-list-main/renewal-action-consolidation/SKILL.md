---
name: renewal-action-consolidation
description: >
  Use this skill whenever the user wants a single consolidated action list for one or more renewal opportunities, combining explicit committed actions (from Skill 2) and implicit playbook-driven actions (from Skill 3) into one prioritised, de-duplicated, ready-to-act bullet list with deadlines and dependencies. Trigger on phrases like "give me the full action list for [customer]", "consolidate my actions for [opp]", "what do I need to do today for my renewals", "pull everything together for [account]", "final action list for my triage", "what are all my actions", or any request for a combined or unified view of what needs to happen on a deal. Also triggers automatically as Step 4 in the full triage pipeline. Can run on a single opportunity or a full batch. Requires the enriched context block from Skills 2 and 3 if available; falls back to running its own Salesforce queries if not.
compatibility: "Requires Salesforce MCP connector. Gmail not required at this stage — action data is consumed from upstream skills or re-derived from Salesforce."
---

# Renewal Action Consolidation Skill

## Purpose

Produce the single, definitive action list a rep needs to work from — combining explicit committed actions (things that were said or written) with implicit playbook-driven actions (things the cadence requires) into one de-duplicated, prioritised, dated, dependency-aware, categorised list per opportunity.

This skill is the last step in the pipeline. Its job is not to discover new information — Skills 2 and 3 have done that. Its job is to **merge, de-duplicate, sequence, date, categorise, and present** the combined output in a form that can be acted on directly without further processing.

---

## Input modes

### Mode A — Single opportunity, no upstream context
The user requests an action list for one opportunity and no enriched context block is present. Run a lightweight Salesforce retrieval to get the core fields, then apply a simplified version of the explicit and implicit assessment inline before consolidating. This mode trades depth for speed — it will not be as thorough as running Skills 2 and 3 separately first.

### Mode B — Single opportunity, upstream context present
An enriched context block from Skills 2 and 3 is present in the conversation for a single opportunity. Consume the context block directly — do not re-query Salesforce for fields already available. Only fetch supplementary data if a specific action requires detail not in the context block.

### Mode C — Batch from enriched context block
Skills 1, 2, and 3 have all run. A fully enriched context block is present containing `explicit_actions` and `implicit_actions` fields for every opportunity. Process each opportunity in sequence, producing a consolidated action section per opp. This is the default end state of the full triage pipeline.

**Mode detection:** If a context block with both `explicit_actions` and `implicit_actions` fields is present → Mode C. If a context block with only `explicit_actions` is present → Mode B (trigger Skill 3 inline before consolidating, or note the gap). If no context block → Mode A.

---

## Step 0 — Establish today's date

All deadlines are expressed as calendar dates. All "days remaining" figures are computed from today's date. Establish today's date explicitly at the start of every run and use it consistently throughout.

---

## Step 1 — Gather action inputs

### Retrieve the Salesforce org base URL (once per run)

Before fetching any opportunity data, get the org's base URL so you can construct deep links for each opportunity card. Run this Apex via `salesforce_execute_anonymous`:

```apex
System.debug(URL.getOrgDomainUrl().toExternalForm());
```

Parse the base URL from the debug log output (it will look like `https://yourorg.my.salesforce.com`). Store it for the whole run — do not re-fetch for every opportunity in a batch. Construct each opportunity's URL as `{base_url}/{Opportunity.Id}`.

If the Apex call fails, fall back to `https://login.salesforce.com/{Opportunity.Id}` and add a small note in the card header that the link may need adjustment.

### Mode A — Inline retrieval

> **Date field definitions — critical distinction:**
> - **`Renewal_Date__c` (Renewal Date)** — the contractual start date of the renewal subscription. Day after current contract expiry. Matches the "Start Date" on renewal quotes. Use this for all deadline and urgency calculations.
> - **`CloseDate` (Close Date)** — an internal tracking date, typically set 30 days before the Renewal Date. No contractual weight. Do not use for deadline calculations.

Retrieve the core opportunity fields:

```soql
SELECT Id, Name, StageName, CloseDate, Renewal_Date__c, Amount, Description, NextStep,
       Account.Name, AccountId, Next_Follow_Up_Date__c, Owner.Name
FROM Opportunity
WHERE Id = '[OppId]'
LIMIT 1
```

Also retrieve open tasks:

```soql
SELECT Id, Subject, Description, Status, ActivityDate, Owner.Name
FROM Task
WHERE WhatId = '[OppId]'
  AND Status != 'Completed'
ORDER BY ActivityDate ASC
LIMIT 30
```

From this data, extract:
- **Explicit actions:** Open tasks + any commitments in `Description` "Actions:" sections + `NextStep` field content
- **Implicit actions:** Apply the gate alignment check from Section 4 of the Cadence Reference Card using `Renewal_Date__c` and `StageName`. Flag any gate at risk and the corresponding required action.

Note in the output header that this is a Mode A (lightweight) run and that running Skills 2 and 3 separately will produce a more complete action list.

### Mode B / Mode C — Consume context block

All action inputs come from the enriched context block. The explicit and implicit action lists were already produced by Skills 2 and 3. Do not re-derive them.

For Mode B/C, the only additional Salesforce query needed is if a specific action item in the context block references a dependency (e.g., "confirm legal case status") and the context block does not contain that detail. In that case, do a targeted query for that specific field only.

---

## Step 2 — Merge and de-duplicate

Bring together all explicit actions (from Skill 2 output or Mode A extraction) and all implicit actions (from Skill 3 output or Mode A cadence check) into a single working list.

### De-duplication rules

Two actions are duplicates if they describe **the same required outcome** for the same opportunity, regardless of whether one came from the paper trail and the other from the cadence. Apply these rules:

1. **Identical outcome, different sources → keep one, note both sources.** Example: Skill 2 found an email where the rep committed to sending a quote; Skill 3 flagged Gate 2 as requiring a quote to be sent. These are the same action — keep it once, with source annotated as "Email [date] + Gate 2 (T-90)".

2. **Same topic, different specificity → keep the more specific one.** Example: Skill 3 generated "Send quote by Gate 2 deadline (2 May)"; Skill 2 found "Send 1yr and 3yr quotes to Jessica Laws." Keep the Skill 2 version (more specific) but add the Gate 2 deadline from Skill 3.

3. **Same owner, overlapping deadline → merge into one action with the earlier deadline.** Do not list two actions that are logically sequential steps of the same task as separate items — merge them and note the sequence.

4. **Different owners, related tasks → keep separate but link with a dependency note.** Example: "Sales Ops to generate quote" and "Rep to send quote to customer" are separate actions for different owners, but the second depends on the first — flag this.

5. **Genuinely distinct actions → keep both.** When in doubt, keep both — it is better to show a rep a slight redundancy than to silently drop an action.

---

## Step 3 — Assign final priority

After merging, re-assign priority to each consolidated action using the following rules. Priority from upstream skills is a starting point — the consolidation step can escalate but should not downgrade without good reason.

### 🔴 Critical — Act today
Any of:
- Hard contractual deadline within 3 calendar days (NNR, SOW expiry, license extension expiry, AR notice window, counter-signature on a customer-signed document)
- Gate 4 violation (renewal date passed, opp still open)
- Customer is waiting with no response from the rep for > 3 business days on a blocking item
- Deal will lapse or auto-renew at penalty pricing within 7 days without action

### 🔴 High — Act this week
Any of:
- Gate failure or gate at risk within 14 days
- Contractual deadline within 4–14 days
- Customer commitment overdue > 7 days with no chase
- Internal escalation (Legal, Sales Ops, VP) requested > 5 days ago with no response
- HVO at T-60 with incomplete renewal pack
- High churn risk with no escalation on record

### 🟡 Medium — Act within 2 weeks
Any of:
- Gate at risk within 15–30 days at current trajectory
- Contractual deadline 15–30 days away
- Committed action with a specific future due date
- Internal request requiring multi-step fulfilment (novation, vendor registration, HVO prep)
- Customer-owned action overdue 1–7 days

### 🟢 Watch — No immediate action, but track
- Gate on track; next milestone > 30 days away
- Customer-owned action not yet overdue
- Opportunity item mentioned but not formally committed
- Multi-year or Platinum pitch not yet due based on cadence

---

## Step 3b — Assign action categories

After assigning priority, classify each action into exactly one of the following categories. The category appears as a visual badge on the action in the HTML output, and signals which downstream skill can help carry out that action.

| Category | Badge | Use when… | Downstream skill |
|---|---|---|---|
| 📧 Email Customer | `email` | The action requires drafting or sending a written communication to the customer | Email drafting |
| 📦 Send Deliverable | `deliverable` | The action requires creating and sending a document, quote, pricing narrative, or renewal pack | renewal-deliverables-package, renewal-pricing-justification, renewal-product-mapping |
| 📞 Prepare Call | `call` | The action involves scheduling or preparing for a customer call | call-plan |
| ⚙️ Internal / Admin | `internal` | Internal actions: escalations, legal cases, VP sign-off, vendor registration, approvals | (handle manually) |
| 🔄 Update CRM | `crm` | The action is a Salesforce record update: stage change, next follow-up date, activity log entry | short- or long-salesforce-opp-update |
| 👀 Watch / Awaiting | `watch` | No immediate action required; monitoring or waiting on the customer or an internal party | (no action) |

**Classification guidance:**
- When an action involves both communication AND a deliverable (e.g., "send the renewal pack by email"), classify as 📦 Send Deliverable — the deliverable represents the actual work.
- When an action involves both a call AND a deliverable (e.g., "prepare the renewal pack to walk through on the next call"), classify as 📞 Prepare Call — note the required deliverable in the action text.
- ⚙️ Internal/Admin is the right catch-all for anything not clearly in the other five buckets.
- 👀 Watch/Awaiting should be reserved for actions the rep genuinely cannot advance right now — if they could send a nudge email or chase internally, that is 📧 Email Customer or ⚙️ Internal/Admin respectively.

---

## Step 4 — Add deadline dates and dependencies

For every action in the consolidated list, assign one of:

**A specific calendar date** — computed from:
- A hard contractual deadline (e.g., NNR deadline = `Renewal_Date__c − notice_period − 15 days`)
- A gate marker (e.g., Gate 2 deadline = `Renewal_Date__c − 90 days`)
- A committed date from an email or Salesforce note
- The end of the current working week ("this week" = Friday of the current week) for actions flagged urgent but without a specific date

**"Immediately"** — for Critical actions where every day of delay materially increases risk

**"Not specified"** — only use this if genuinely no date can be inferred. Flag it — an action without a deadline is harder to act on and easier to defer.

### Dependency notation

For actions that depend on another action completing first, add a dependency note in the format:

> *(depends on: [action #N])*

Apply dependency detection systematically:
- Any action that requires a legal case to be open first → depends on "Raise legal case"
- Any customer-facing communication → depends on internal preparation (quote approved, pack ready)
- Any quote send action → depends on quote generation if the quote doesn't yet exist
- Any signature action → depends on document being ready
- Any close/O2C action → depends on signature

Do not create circular dependencies. If A depends on B and B depends on A, flag it as a blocker and escalate.

---

## Step 5 — Sequence the list

Within each priority tier, order actions by:

1. **Earliest hard deadline first** — a legal case due in 2 days comes before a quote due in 5 days, regardless of ARR
2. **Dependency order second** — actions that unblock others come before actions that depend on them
3. **ARR descending third** — within the same deadline and no dependency ordering, higher-value deals first
4. **Owner grouped last** — within all else equal, group by owner (Rep actions first, then Internal, then Customer) so a rep can scan their own items at a glance

---

## Step 6 — Output format (HTML)

All output is produced as a self-contained HTML file saved to the outputs directory. Do not produce markdown output — the HTML report is the single deliverable. The file must be fully self-contained (no external CSS or JS dependencies).

### Design system

Use the following CSS as the base. Do not deviate from these styles — consistency across runs is important.

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; color: #1a1a2e; font-size: 14px; }

/* Page header */
.page-header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 24px 32px; }
.page-header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
.page-header .subtitle { color: #8892b0; font-size: 13px; margin-top: 4px; }

/* Metrics bar */
.metrics-bar { display: flex; gap: 16px; padding: 16px 32px; background: #fff; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
.metric { display: flex; flex-direction: column; align-items: center; padding: 10px 18px; border-radius: 8px; min-width: 110px; }
.metric-val { font-size: 22px; font-weight: 700; }
.metric-label { font-size: 11px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
.metric.total { background: #f1f5f9; }
.metric.critical { background: #fef2f2; }
.metric.critical .metric-val { color: #dc2626; }
.metric.high { background: #fffbeb; }
.metric.high .metric-val { color: #d97706; }
.metric.medium { background: #eff6ff; }
.metric.medium .metric-val { color: #2563eb; }
.metric.arr { background: #f0fdf4; }
.metric.arr .metric-val { color: #16a34a; font-size: 18px; }

/* Alert banner */
.alert-banner { margin: 16px 32px 0; padding: 12px 16px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #991b1b; font-size: 13px; font-weight: 500; }
.alert-banner strong { font-weight: 700; }

/* Sections */
.section { margin: 20px 32px; }
.section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 10px; padding-left: 2px; }

/* Opportunity cards — click-to-expand */
.opp-card { background: white; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.opp-header { display: flex; align-items: center; padding: 14px 18px; cursor: pointer; gap: 12px; user-select: none; transition: background 0.15s; }
.opp-header:hover { background: #f8fafc; }

/* Priority dot */
.priority-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.dot-critical { background: #dc2626; box-shadow: 0 0 0 3px #fee2e2; }
.dot-high { background: #d97706; box-shadow: 0 0 0 3px #fef3c7; }
.dot-medium { background: #2563eb; box-shadow: 0 0 0 3px #dbeafe; }
.dot-monitor { background: #94a3b8; box-shadow: 0 0 0 3px #f1f5f9; }

/* Header content */
.opp-main { flex: 1; min-width: 0; }
.opp-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.opp-meta { display: flex; gap: 10px; margin-top: 3px; flex-wrap: wrap; align-items: center; }
.opp-stage { font-size: 12px; color: #64748b; }

/* Status badges (in card header) */
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; }
.badge-critical { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
.badge-high { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
.badge-medium { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
.badge-monitor { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
.badge-overdue { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
.badge-churn { background: #fdf4ff; color: #9333ea; border: 1px solid #e9d5ff; }
.badge-hvo { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
.badge-gate { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }

/* Right side of card header */
.opp-right { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.opp-arr { font-size: 13px; font-weight: 600; color: #0f172a; }
.opp-days { font-size: 12px; }
.days-past { color: #dc2626; font-weight: 600; }
.days-urgent { color: #d97706; font-weight: 600; }
.days-normal { color: #64748b; }
.sf-link { font-size: 11px; color: #3b82f6; text-decoration: none; }
.sf-link:hover { text-decoration: underline; }
.chevron { font-size: 16px; color: #94a3b8; transition: transform 0.2s; flex-shrink: 0; }
.chevron.open { transform: rotate(180deg); }

/* Expandable body */
.opp-body { display: none; border-top: 1px solid #f1f5f9; padding: 18px 20px; }
.opp-body.open { display: block; }

/* Deal snapshot */
.deal-snapshot { background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; line-height: 1.6; color: #475569; border-left: 3px solid #cbd5e1; }
.deal-snapshot strong { color: #1e293b; }

/* Mode A warning */
.mode-a-warning { background: #fefce8; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #78350f; margin-bottom: 12px; }

/* Explicit / Implicit action sections */
.actions-section { margin-bottom: 14px; }
.actions-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; }
.actions-title.explicit { color: #1d4ed8; }
.actions-title.implicit { color: #6d28d9; }

/* Action table */
.action-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.action-table th { background: #f8fafc; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
.action-table td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; line-height: 1.5; }
.action-table tr:last-child td { border-bottom: none; }
.action-table tr:hover td { background: #fafafa; }

/* Owner chips */
.owner-chip { display: inline-flex; padding: 1px 7px; border-radius: 100px; font-size: 11px; font-weight: 600; }
.owner-rep { background: #dbeafe; color: #1d4ed8; }
.owner-customer { background: #dcfce7; color: #15803d; }
.owner-internal { background: #fef9c3; color: #854d0e; }
.owner-legal { background: #f3e8ff; color: #7e22ce; }

/* Category badges (inside action rows) */
.cat-badge { display: inline-flex; padding: 1px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 4px; }
.cat-email { background: #dbeafe; color: #1e40af; }
.cat-deliverable { background: #ede9fe; color: #5b21b6; }
.cat-call { background: #dcfce7; color: #166534; }
.cat-internal { background: #f3f4f6; color: #374151; }
.cat-crm { background: #ffedd5; color: #9a3412; }
.cat-watch { background: #f8fafc; color: #64748b; }

.source-tag { font-size: 11px; color: #94a3b8; font-style: italic; }
.dependency-note { font-size: 11px; color: #c2410c; font-style: italic; }
.section-divider { height: 1px; background: #e2e8f0; margin: 14px 0; }

/* Key dates table */
.key-dates { margin-top: 14px; }
.key-dates h4 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px; }
.key-dates table { width: 100%; border-collapse: collapse; font-size: 12px; }
.key-dates td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; color: #475569; }
.key-dates td:first-child { font-weight: 600; color: #1e293b; width: 160px; }
.key-dates tr:last-child td { border-bottom: none; }

/* Skills footer */
.skills-footer { margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f5f9; }
.skills-footer h4 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 8px; }
.skill-suggestion { font-size: 12px; color: #475569; margin-bottom: 4px; }
.skill-suggestion .cat-badge { vertical-align: middle; }

/* Pipeline summary (batch) */
.pipeline-summary { margin: 20px 32px; background: white; border-radius: 10px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.pipeline-summary h2 { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
.pipeline-summary p { font-size: 13px; color: #64748b; margin-bottom: 12px; }
.critical-flat-list { margin-top: 12px; }
.critical-flat-list h3 { font-size: 13px; font-weight: 700; color: #dc2626; margin-bottom: 8px; }
.critical-flat-list li { font-size: 13px; color: #1e293b; margin-bottom: 4px; padding-left: 4px; }

/* Pipeline close-out footer */
.pipeline-closeout { margin: 16px 32px 24px; padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 12px; color: #64748b; border: 1px solid #e2e8f0; }
.pipeline-closeout strong { color: #1e293b; }

@media (max-width: 768px) {
  .metrics-bar { padding: 12px 16px; }
  .section { margin: 12px 16px; }
  .opp-right { gap: 8px; }
  .opp-arr { display: none; }
  .page-header { padding: 16px; }
}
```

### JavaScript (toggle function)

Include this at the bottom of `<body>`:

```javascript
<script>
function toggle(header) {
  const body = header.nextElementSibling;
  const chevron = header.querySelector('.chevron');
  body.classList.toggle('open');
  chevron.classList.toggle('open');
}
</script>
```

### Page structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Renewal Action List — [DD Mon YYYY]</title>
  <style>[embedded CSS above]</style>
</head>
<body>

<!-- Header -->
<div class="page-header">
  <h1>🔄 Daily Renewal Action List</h1>
  <div class="subtitle">Tim Courtenay · [Weekday, DD Month YYYY] · Generated automatically</div>
</div>

<!-- Metrics bar (batch only; for single opp, omit or simplify) -->
<div class="metrics-bar">
  <div class="metric total"><span class="metric-val">[N]</span><span class="metric-label">Open Opps</span></div>
  <div class="metric critical"><span class="metric-val">[N]</span><span class="metric-label">Critical</span></div>
  <div class="metric high"><span class="metric-val">[N]</span><span class="metric-label">High</span></div>
  <div class="metric medium"><span class="metric-val">[N]</span><span class="metric-label">Medium</span></div>
  <div class="metric total"><span class="metric-val">[N]</span><span class="metric-label">Monitor</span></div>
  <div class="metric arr"><span class="metric-val">$[X]M</span><span class="metric-label">Total ARR</span></div>
</div>

<!-- Alert banner: list today's most time-critical items -->
<div class="alert-banner">
  ⚠️ <strong>[N] deals need attention today:</strong> [Account] — [reason] · [Account] — [reason] · ...
</div>

<!-- ===== CRITICAL section ===== -->
<div class="section">
  <div class="section-title">🔴 Critical — Act Today</div>

  <!-- One .opp-card per opportunity in this tier -->
  <div class="opp-card">
    <div class="opp-header" onclick="toggle(this)">
      <div class="priority-dot dot-critical"></div>
      <div class="opp-main">
        <div class="opp-name">[Account Name] — [Opp/Product Name]</div>
        <div class="opp-meta">
          <span class="opp-stage">[Stage]</span>
          <span class="badge badge-critical">[Short status label]</span>
          <!-- Add badge-overdue, badge-churn, badge-hvo, badge-gate as relevant -->
        </div>
      </div>
      <div class="opp-right">
        <span class="opp-arr">$[Amount]</span>
        <span class="opp-days [days-past|days-urgent|days-normal]">[N]d</span>
        <!-- Use days-past for overdue (negative), days-urgent for <30d, days-normal otherwise -->
        <a href="[sf_url]" class="sf-link" target="_blank" onclick="event.stopPropagation()">🔗 SF</a>
        <span class="chevron">▼</span>
      </div>
    </div>

    <div class="opp-body">
      <!-- Mode A warning (omit if Mode B/C) -->
      <div class="mode-a-warning">⚠️ Lightweight mode — running Skills 2 and 3 separately will produce a more complete action list.</div>

      <!-- Deal snapshot -->
      <div class="deal-snapshot">
        <strong>Snapshot:</strong> [3-sentence summary — most important action today, why it is urgent, key context]
      </div>

      <!-- Explicit actions -->
      <div class="actions-section">
        <div class="actions-title explicit">📋 Explicit Actions</div>
        <table class="action-table">
          <tr><th>#</th><th>Action</th><th>Owner</th><th>Due</th><th>Source</th></tr>
          <tr>
            <td>1</td>
            <td>
              🔴 [Action text]
              <span class="cat-badge cat-deliverable">📦 Send Deliverable</span>
              <span class="dependency-note">(depends on: #[N])</span>
            </td>
            <td><span class="owner-chip owner-rep">Tim</span></td>
            <td>[DD Mon YYYY]</td>
            <td class="source-tag">[Email/SF field, date]</td>
          </tr>
        </table>
      </div>

      <!-- Implicit actions (omit section entirely if none) -->
      <div class="actions-section">
        <div class="actions-title implicit">🎯 Implicit Actions</div>
        <table class="action-table">
          <tr><th>#</th><th>Action</th><th>Rationale</th><th>Due</th><th>Owner</th></tr>
          <tr>
            <td>1</td>
            <td>🔴 [Action text] <span class="cat-badge cat-internal">⚙️ Internal/Admin</span></td>
            <td>[Cadence section reference or rule that drives this]</td>
            <td>[DD Mon YYYY]</td>
            <td><span class="owner-chip owner-rep">Tim</span></td>
          </tr>
        </table>
      </div>

      <div class="section-divider"></div>

      <!-- Key dates -->
      <div class="key-dates">
        <h4>Key Dates</h4>
        <table>
          <tr><td>Renewal date</td><td>[DD Mon YYYY]</td></tr>
          <tr><td>Non-renewal deadline</td><td>[DD Mon YYYY]</td></tr>
          <tr><td>Gate 2 (T-90)</td><td>[DD Mon YYYY]</td></tr>
          <tr><td>AR trigger</td><td>[DD Mon YYYY or N/A]</td></tr>
          <tr><td>Next follow-up</td><td>[DD Mon YYYY]</td></tr>
        </table>
      </div>

      <!-- Skills footer — include only categories present in this card's actions -->
      <div class="skills-footer">
        <h4>Skills that can help</h4>
        <div class="skill-suggestion"><span class="cat-badge cat-deliverable">📦 Send Deliverable</span> → say: "Create the renewal deliverables package for [Customer]"</div>
        <div class="skill-suggestion"><span class="cat-badge cat-call">📞 Prepare Call</span> → say: "Create a call plan for [Customer] — renewal discussion"</div>
        <div class="skill-suggestion"><span class="cat-badge cat-crm">🔄 Update CRM</span> → say: "Create a Salesforce opp update for [Opp name]"</div>
      </div>
    </div>
  </div>

  <!-- Repeat .opp-card for each opp in this tier -->
</div>

<!-- ===== HIGH section ===== -->
<div class="section">
  <div class="section-title">🟠 High — Act This Week</div>
  <!-- .opp-card elements with dot-high -->
</div>

<!-- ===== MEDIUM section ===== -->
<div class="section">
  <div class="section-title">🔵 Medium — Act Within 2 Weeks</div>
  <!-- .opp-card elements with dot-medium -->
</div>

<!-- ===== MONITOR section ===== -->
<div class="section">
  <div class="section-title">⚫ Monitor — Watch &amp; Maintain Cadence</div>
  <!-- .opp-card elements with dot-monitor -->
</div>

<!-- Pipeline close-out footer (batch) -->
<div class="pipeline-closeout">
  <strong>Pipeline health summary:</strong> [N] total actions | [N] Critical | [N] High | [N] Medium | [N] Watch.<br>
  [Gate compliance summary — which gates are failing and for which accounts]<br>
  [Cross-opp pattern observation — systemic issues or blockers]
</div>

<script>
function toggle(header) {
  const body = header.nextElementSibling;
  const chevron = header.querySelector('.chevron');
  body.classList.toggle('open');
  chevron.classList.toggle('open');
}
</script>
</body>
</html>
```

### Card header badge guidance

Choose the most relevant status badge(s) for the `.opp-meta` row. Pick 1–3 maximum per card:

| Badge class | Use when |
|---|---|
| `badge-critical` | Contract deadline < 3 days, Gate 4 violation, deal will lapse |
| `badge-high` | Gate at risk < 14 days, overdue commitment |
| `badge-medium` | Gate at risk 15–30 days, committed action with future due date |
| `badge-overdue` | Renewal date has passed (Gate 4 violation or opp past due) |
| `badge-churn` | Churn risk explicitly flagged in Salesforce or email |
| `badge-hvo` | ARR ≥ $150K — always add with the dollar figure |
| `badge-gate` | Specific gate failure or gate-at-risk, gate number in badge text |
| `badge-monitor` | Watch tier — no immediate urgency |

### Category badge usage in action rows

Each action row in the table should include a `cat-badge` inline after the action text, classified per Step 3b. The badge makes the downstream skill immediately obvious without the rep having to read the Skills footer.

| Badge class | Category |
|---|---|
| `cat-email` | 📧 Email Customer |
| `cat-deliverable` | 📦 Send Deliverable |
| `cat-call` | 📞 Prepare Call |
| `cat-internal` | ⚙️ Internal/Admin |
| `cat-crm` | 🔄 Update CRM |
| `cat-watch` | 👀 Watch/Awaiting |

### Priority emoji in action text

Prefix each action's text with the priority emoji to allow scanning without reading the header:
- 🔴 Critical
- 🟠 High
- 🟡 Medium
- 🟢 Watch

### Skills footer — trigger phrases by category

Include only the categories that actually appear in this card's actions.

| Category | Trigger phrase to show |
|---|---|
| 📧 Email Customer | "Draft an email to [customer] about [topic]" |
| 📦 Send Deliverable | "Create the renewal deliverables package for [customer]" |
| 📞 Prepare Call | "Create a call plan for [customer] — [call type]" |
| ⚙️ Internal/Admin | *(no skill suggestion — note: handle manually)* |
| 🔄 Update CRM | "Create a Salesforce opp update for [opp name]" |
| 👀 Watch/Awaiting | *(no skill suggestion)* |

### Batch run additions

For Mode C (batch), include the **metrics bar** and **alert banner** above the first section. The alert banner should list only the most time-critical items across all opps (hard deadlines in the next 7 days).

End with the **pipeline close-out block** summarising gate compliance, cross-opp patterns, and total action counts.

---

## Step 7 — Update the next follow-up date in Salesforce (optional, with permission)

After producing the action list, offer to update the `Next_Follow_Up_Date__c` field in Salesforce for each opportunity to reflect the earliest due action in the list.

**Do not do this automatically.** Always ask first:

> "Would you like me to update the Next Follow-Up Date in Salesforce for these opportunities to reflect today's action deadlines?"

If the user confirms, use `salesforce_dml_records` (or equivalent) to set `Next_Follow_Up_Date__c` to the due date of the earliest non-Watch action for each opp. Log the change in the output.

If the user declines, note the recommended next follow-up dates in the output as a reference only.

---

## Handling edge cases

**Skills 2 or 3 have not been run (Mode A):** Produce the lightweight consolidated list from Salesforce data only. Clearly label it as incomplete and recommend running the full pipeline for a thorough output. Do not fabricate action items that would require Gmail data or deep cadence assessment.

**Explicit and implicit lists are both empty:** This should be rare. If it occurs, do not produce an empty action list silently — note that no outstanding actions were identified, confirm the opportunity stage and days-to-renewal, and flag whether this appears correct given the cadence position. An opp at T-45 with an empty action list is suspicious and should be noted.

**Conflicting priorities between Skills 2 and 3:** If Skill 2 assigned an action as Medium and Skill 3 escalated it to High (or vice versa), always take the higher priority. The consolidation step escalates, never downgrades.

**Action owner is unclear:** If an action came from both explicit and implicit sources but the owner is ambiguous, default to the rep as owner — it is their deal and their responsibility to route it correctly. Note the ambiguity.

**Very large batch (> 20 opps):** Process all opps but prioritise the output rendering — lead with the pipeline summary and the "Today's critical actions" flat list before individual opp sections. A rep working a large pipeline needs the top-line view first.

**Dependency chain is broken:** If Action B depends on Action A, but Action A is owned by an internal team with no confirmed timeline, flag the entire chain as blocked and escalate the root dependency to High priority. A dependent action with an unresolved upstream blocker is not Medium — it is effectively blocked.

---

## Core principles

**One list, one truth.** The consolidated list supersedes both the Skill 2 and Skill 3 outputs. Once it has been produced, the rep should work from this list only — not from the separate explicit and implicit outputs. The value of consolidation is that the rep never has to mentally merge two lists themselves.

**Categories enable action, not just labelling.** Every category badge is a prompt — it tells the rep which skill to invoke next. The goal is that after reading the HTML report, the rep can immediately say "create a call plan for X" or "draft the deliverables package for Y" without having to think about which tool to use.

**Dates over day counts.** Every deadline must be expressed as a specific calendar date, not a relative count like "in 14 days" or "T-60". A date can be acted on; a count requires a calculation that may not happen.

**Dependencies prevent false completions.** An action marked complete when its dependency is still open is not complete. The dependency notation exists to prevent a rep from sending a quote before the quote exists, or closing an opp before the O2C ticket is filed. Flag every dependency explicitly.

**The summary is the most-read part.** The 3-sentence summary at the top of each opp section is what a rep reads first — especially in a batch run where they may not have time to read every action. Make it precise, direct, and free of hedging. "The most important action today is X because Y" is the right format. "There are several things to consider" is not.

**Never fabricate a date.** If a deadline cannot be computed from the contract, the cadence, a committed email, or the SF record, express it as "not specified" and flag it. A fabricated date that a rep acts on is worse than no date at all.
