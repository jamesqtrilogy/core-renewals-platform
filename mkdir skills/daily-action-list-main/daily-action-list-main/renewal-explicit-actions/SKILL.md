---
name: renewal-explicit-actions
description: >
  Use this skill to identify and list all explicit outstanding actions for one or more Salesforce renewal opportunities, based on the Salesforce opportunity data (description, next steps, tasks, events) and Gmail history. Trigger on phrases like "what are the explicit actions for [customer]", "what did we commit to on [opp]", "find outstanding actions for [account]", "what's been promised to [customer]", "run explicit actions for my triage list", or any request to extract committed but uncompleted actions from deal history. Also triggers automatically as Step 2 in the full triage pipeline when running across all opportunities from the triage list. Scoped to a single opportunity per invocation when run standalone; can process a batch when fed the triage context block from the renewal-opportunity-triage skill. Does not assess cadence or playbook compliance — that is the job of the implicit actions skill.
compatibility: "Requires Salesforce MCP and Gmail MCP connectors"
---

# Renewal Explicit Actions Skill

## Purpose

Extract every committed, outstanding action from the paper trail of a renewal opportunity — Salesforce logs, task records, and Gmail threads — and present them as a clean, sourced, prioritised list.

The distinction that defines this skill: **explicit actions are things that were actually said or written down** — a promise made on a call, a task created in Salesforce, an email commitment. They are factual, not inferred. Inference and cadence assessment belong to the implicit actions skill (Skill 3).

---

## Input modes

This skill operates in two modes depending on context:

### Mode A — Single opportunity (standalone)
The user provides one opportunity by name, Salesforce URL, or Salesforce ID. Run the full data-gathering and synthesis process for that one opp.

### Mode B — Batch from triage context block
The triage skill (Skill 1) has already run and produced a JSON context block containing `id`, `account`, `name`, `stage`, `close_date`, `renewal_date`, `days_to_renewal`, `amount`, and `is_hvo` for each opp. In this mode, process each opportunity in the context block in order, producing a separate action section per opp. Do not re-query the triage filter conditions — trust the context block.

**If the context block is present in the conversation, default to Mode B.** Do not ask the user which mode to use — infer it.

---

## Step 0 — Resolve the opportunity ID

**Mode A:** The user may provide a name, a URL, or an ID.
- If a Salesforce URL: extract the 15- or 18-character ID from the path.
- If a name: use `salesforce_search_all` to find the matching record. If multiple plausible matches, confirm with the user before proceeding.
- If an ID: use directly.

**Mode B:** IDs come from the context block. Use them directly — no resolution needed.

---

## Step 1 — Retrieve Salesforce data

Run the following queries for each opportunity. In Mode B, batch where possible to reduce round-trips — but do not sacrifice completeness for speed.

### 1a. Core opportunity record

> **Date field definitions — critical distinction:**
> - **`Renewal_Date__c` (Renewal Date)** — the contractual start date of the renewal subscription. Day after current contract expiry. Matches the "Start Date" on renewal quotes. Use this for urgency and deadline reasoning.
> - **`CloseDate` (Close Date)** — an internal tracking date, typically set 30 days before the Renewal Date. No contractual weight. Do not represent it as a contractual deadline.

```soql
SELECT Id, Name, StageName, CloseDate, Renewal_Date__c, Amount, Description, NextStep,
       Account.Name, AccountId, Next_Follow_Up_Date__c
FROM Opportunity
WHERE Id = '[OppId]'
LIMIT 1
```

Read `Description` and `NextStep` character by character. These two fields are the richest source of explicit commitments in the entire system. The opportunity owner logs structured call notes directly into Description — look for:
- Bullet-point "Actions:" sections at the end of call notes
- Inline commitments ("I told the customer I would...")
- Dates mentioned alongside tasks ("will revert by Thursday")
- "NextStep" field — often contains the single most current committed action

### 1b. Opportunity contact roles

```soql
SELECT ContactId, Contact.FirstName, Contact.LastName,
       Contact.Email, Role, IsPrimary
FROM OpportunityContactRole
WHERE OpportunityId = '[OppId]'
```

Collect all email addresses. You need these for Step 2 (Gmail). Note which contact is the Primary Contact — their email is the most important Gmail search target.

### 1c. Open tasks on the opportunity

```soql
SELECT Id, Subject, Description, Status, ActivityDate,
       Owner.Name, CreatedDate, Who.Name
FROM Task
WHERE WhatId = '[OppId]'
  AND Status != 'Completed'
ORDER BY ActivityDate ASC
LIMIT 50
```

Open tasks are explicit commitments with a formal record. Treat every open task as a confirmed outstanding action unless its description makes clear it has been resolved.

### 1d. Recently completed tasks (last 60 days)

```soql
SELECT Id, Subject, Description, Status, ActivityDate,
       Owner.Name, CreatedDate, Who.Name
FROM Task
WHERE WhatId = '[OppId]'
  AND Status = 'Completed'
  AND CreatedDate >= LAST_N_DAYS:60
ORDER BY ActivityDate DESC
LIMIT 50
```

Completed tasks matter because:
- Their `Description` fields often contain follow-on commitments made during execution ("called Brad, he asked me to resend the amendment next week")
- A task marked complete does not necessarily mean the underlying commitment is closed — check the description

### 1e. Events (logged calls and meetings)

```soql
SELECT Id, Subject, Description, StartDateTime, Owner.Name
FROM Event
WHERE WhatId = '[OppId]'
  AND StartDateTime >= LAST_N_DAYS:60
ORDER BY StartDateTime DESC
LIMIT 30
```

Event descriptions frequently contain call notes and action items, especially for read.ai auto-synced meetings.

### 1f. Account-level tasks (catch activity logged at the account, not the opp)

```soql
SELECT Id, Subject, Description, Status, ActivityDate, Owner.Name, CreatedDate
FROM Task
WHERE WhatId = '[AccountId]'
  AND CreatedDate >= LAST_N_DAYS:60
ORDER BY ActivityDate DESC
LIMIT 30
```

---

## Step 2 — Search Gmail

Gmail is the ground truth for commitments made outside Salesforce — particularly anything agreed in the last few days that hasn't been logged yet, and commitments made by the customer that need a follow-through.

### 2a. Search by primary contact email

```
gmail_search: from:[pc@customer.com] OR to:[pc@customer.com] newer_than:45d
```

### 2b. Search by account name (catches threads with unregistered contacts)

```
gmail_search: "[Account Name]" newer_than:45d
```

### 2c. Search by opportunity-specific terms (for complex or multi-contact accounts)

If the account has multiple active contacts or the account name is generic (e.g., "Enterprise Holdings"), add a second search scoped to the product or opp name:

```
gmail_search: "[Account Name]" "[Product Name]" newer_than:45d
```

### 2d. Read the threads

From the search results, identify threads that are deal-relevant (renewal, pricing, contract, legal, quote, extension, signature, SOW, PO). For each relevant thread, use `gmail_read_thread` to retrieve the full conversation.

**Reading threshold:** Read a minimum of the 5 most recent relevant threads. For HVO deals (`is_hvo = true`) or deals with `days_to_renewal ≤ 60`, read up to 10 threads — more is at stake and the cost of a missed commitment is higher.

**Do not skip threads that appear routine.** A "quick question" email often contains the most live commitment in the entire deal.

---

## Step 3 — Extract explicit actions

Now synthesise everything you have read. Your goal is to produce a list of actions that are:

1. **Real** — explicitly stated or written, not inferred
2. **Outstanding** — not yet completed, based on available evidence
3. **Specific** — clear enough that someone can act on them without needing to re-read the source

### What counts as an explicit action

Include:
- Any item in a Salesforce "Actions:" bullet list from a call note that has no corresponding completion marker
- Any open Salesforce task
- Any commitment in a Salesforce `NextStep` field
- Any email in which the rep or the customer committed to a specific deliverable ("I'll send you...", "Please confirm...", "Can you check...")
- Any agreed next step from a meeting (including read.ai synced events)
- Any pending legal case, quote approval, or internal request with no resolution note
- Any customer ask that the rep acknowledged without resolving ("I'll look into that")

### What does NOT count

Exclude:
- Background context, relationship history, or deal narrative
- Completed items with no follow-on (a task marked Complete with no open thread)
- Vague intentions with no commitment ("it would be good to discuss pricing at some point")
- System-generated entries (e.g., "SYSTEM - Quote Q-XXXXX is out for signature") unless they represent a live action item
- Actions that belong to other deals (e.g., if a call note covers two accounts)

### Ownership attribution

For each action, attribute it to one of:
- **Rep** (the opportunity owner — use their first name if known from the Salesforce record)
- **Customer** (named individual if known, or company name)
- **Internal** (Sales Ops, Legal, Finance, SDR, AM — be specific)
- **Unclear** (source is ambiguous — flag this)

Customer-owned actions still belong on the list. If the customer committed to something and there is no confirmation it has been done, that is a pending item the rep needs to chase.

### Deduplication

If the same action appears in multiple sources (e.g., an email AND a Salesforce task), list it once and note all sources. Multi-source actions are more reliably "live" — flag them as higher priority.

---

## Step 4 — Assign priority

Assign each action one of three priority levels. Evaluate in order — assign the first that matches.

### 🔴 High
- Due date has already passed
- Customer is explicitly waiting for this (they have chased or it was customer-requested)
- Blocking the deal from progressing (e.g., legal case not raised, quote not sent, signatory not confirmed)
- Relates to a hard contractual deadline (NNR deadline, AR notice window, extension expiry, SOW expiry)
- Open Salesforce task with `ActivityDate` in the past

### 🟡 Medium
- Has a specific committed due date that is still in the future
- Was explicitly agreed on a call or in an email in the last 14 days
- Internal action required before the customer can act (e.g., "generate quotes before sending to customer")
- Open Salesforce task with `ActivityDate` upcoming

### 🟢 Low / Watch
- Mentioned but no specific date attached
- Longer-horizon planning item ("once we agree on terms, we'll discuss billing schedule")
- Customer dependency with no current urgency signal

---

## Step 5 — Output format

### Single opportunity (Mode A)

```
## Explicit Actions — [Account Name]
### [Opportunity Name]
*Stage: [Stage] | Renewal Date: DD Mon YYYY ([N] days) | Close Date: DD Mon YYYY (internal) | ARR: $[Amount] | As of: DD Mon YYYY*

---

#### 🔴 High Priority
| # | Action | Owner | Due | Source |
|---|--------|-------|-----|--------|
| 1 | [Specific, actionable description] | [Rep name / Customer name / Internal team] | [DD Mon YYYY or "not specified"] | [e.g., Email 8 Apr / SF Task / Opp Description / Event note] |

#### 🟡 Medium Priority
| # | Action | Owner | Due | Source |
|---|--------|-------|-----|--------|

#### 🟢 Low / Watch
| # | Action | Owner | Due | Source |
|---|--------|-------|-----|--------|

---

**Deal snapshot:** [2–3 sentences: current status, key contacts, most important open risk.]
```

### Batch run (Mode B)

Repeat the above structure for each opportunity in sequence. Add a top-level summary before the first opp:

```
## Explicit Actions — Full Triage Run
*[N] opportunities | Run date: DD Mon YYYY*

---
[Individual opp sections follow, separated by horizontal rules]
```

After all opps, add a **Cross-opp patterns** note (3–5 sentences max) flagging anything that spans multiple deals — e.g., "Legal is a blocker on 4 of the 20 opps", "3 deals have customer commitments that are overdue with no chase on record".

---

## Step 6 — Emit the enriched context block (Mode B only)

When running in batch mode, update the context block from Skill 1 with explicit action data, so Skill 3 (implicit actions) can consume it without re-reading the action list.

Append the following fields to each opportunity object in the JSON:

```json
{
  "explicit_actions": {
    "high_count": N,
    "medium_count": N,
    "low_count": N,
    "customer_actions_outstanding": true|false,
    "legal_case_open": true|false,
    "quote_unsigned": true|false,
    "last_customer_contact_date": "YYYY-MM-DD or null",
    "days_since_last_customer_contact": N,
    "blocking_action_present": true|false,
    "blocking_action_summary": "One-line description or null"
  }
}
```

Emit the updated context block as a collapsed `<details>` section labelled "Updated context block for Skill 3 — click to expand".

---

## Handling edge cases

**No email threads found:** This is unusual and worth flagging. Note it in the deal snapshot: "No Gmail threads found for this account in the last 45 days — Salesforce description is the sole source for this action list." Do not treat absence of email as evidence of no outstanding actions.

**Description field very long:** Salesforce opportunity descriptions can span many months of history. Read the full field — do not truncate. Older entries may contain commitments that were made but never closed.

**Multiple contacts, only one active:** List actions involving all contacts, but note in the deal snapshot which contact is actively engaged and which are dormant.

**Customer-side action with no chase on record:** If the customer committed to something more than 7 days ago and there is no evidence the rep has followed up, treat it as a High priority action: "Chase [customer] for [commitment] — no follow-up on record since [date]."

**Internal action with no response:** If the rep escalated internally (to Sales Ops, Legal, AM, Finance) and there is no response logged, treat it as a Medium priority action: "Follow up with [team] on [request] — no response recorded."

**Opp with very recent first contact:** If the opportunity was first engaged fewer than 14 days ago and has few logged activities, produce a short action list of only what is explicitly committed, and note that the deal is early-stage — do not pad with inferred items.

---

## Core principles

**Source everything.** Every action must have a traceable source. "Email 8 Apr" is a source. "Assumed" is not. If you cannot identify a source, do not include the action.

**Explicit means explicit.** Do not include things that should logically follow from the deal situation — those belong in Skill 3. This skill is a reading and extraction task, not a reasoning task. If the rep didn't say it or write it, it doesn't go here.

**Customer commitments are actions too.** A customer who promised to share module mapping, confirm a decision, or submit a PO has created an outstanding action on the rep's side — they need to chase it. Surface these clearly, attributed to the customer, so they aren't dropped.

**Don't sanitise.** If there are 12 high-priority actions on a deal, list 12. Do not collapse or summarise to make the list look manageable. The rep needs the full picture to prioritise.

**Recency governs priority, not volume.** A single email from yesterday with a hard deadline beats five old Salesforce tasks that were clearly resolved. Weight the evidence by its age and specificity.
