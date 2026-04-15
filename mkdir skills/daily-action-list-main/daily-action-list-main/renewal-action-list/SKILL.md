---
name: renewal-action-list
description: >
  Use this skill whenever the user wants to surface all committed actions or follow-ups for a Salesforce opportunity — especially renewal deals. Trigger on phrases like "what do I need to follow up on for [customer/opp]", "give me the action list for [opp]", "what's outstanding with [customer]", "pull together everything I need to do for [opportunity]", "renewal actions for [account]", "what did I commit to for [deal]", "get my action items for [opp]", or any time the user mentions an opportunity name or Salesforce link and wants to understand what needs to happen next. This skill casts a deliberately wide net — it reads Salesforce activity history (tasks, events, call logs, opp description, next steps) AND recent Gmail threads with the customer's contacts, then synthesises everything into a single prioritised action list. Don't wait for the user to say "renewal action list" explicitly — use it whenever the intent is to identify open commitments or follow-ups tied to a specific opportunity.
compatibility: "Requires Salesforce MCP and Gmail MCP connectors"
---

# Renewal Action List

## Purpose

Your goal is to produce a single, prioritised action list for a given Salesforce opportunity. The challenge — and the reason this skill exists — is that committed actions are rarely all in one place. A rep might log a call note in Salesforce, agree to something over email, and have a task created by their manager, all for the same deal. This skill reads every relevant source and brings them together.

## Step 0 — Get the opportunity identifier

The user will provide either:
- An opportunity **name** (e.g. "Acme Corp Renewal 2026")
- A Salesforce **URL** (extract the 15- or 18-character opportunity ID from it)

If the input is ambiguous, use `salesforce_search_all` with the text to find the matching opportunity. Confirm the right one with the user if there are multiple plausible matches.

## Step 1 — Retrieve the opportunity and its context

Run these Salesforce queries. Do them in a logical order — you'll need the opp record first to get account/contact IDs, then you can fan out.

### 1a. Core opportunity record
```soql
SELECT Id, Name, StageName, CloseDate, Renewal_Date__c, Amount, Description, NextStep,
       OwnerId, Owner.Name, AccountId, Account.Name
FROM Opportunity
WHERE Id = '[OppId]'
LIMIT 1
```
The `Description` and `NextStep` fields often contain commitments written by hand — read them carefully.

> **Date field definitions — critical distinction:**
> - **`Renewal_Date__c` (Renewal Date)** — the contractual start date of the renewal subscription. It is the day after the current contract expires. This is a fixed contractual date and matches the "Start Date" on renewal quotes. Use this for urgency and deadline reasoning.
> - **`CloseDate` (Close Date)** — an internal tracking date used by Core Renewals, typically set 30 days before the Renewal Date. It has no contractual weight and is used solely for pipeline visibility and driving action.
>
> When assessing urgency or communicating deadlines, always reference the **Renewal Date**, not the Close Date. The Close Date may appear in Salesforce but should not be represented to the user as a contractual deadline.

### 1b. Contacts on the opportunity
```soql
SELECT ContactId, Contact.FirstName, Contact.LastName, Contact.Email, Role, IsPrimary
FROM OpportunityContactRole
WHERE OpportunityId = '[OppId]'
```
Collect all email addresses — you'll need them for Gmail.

### 1c. Open and completed tasks (go broad — last 90 days minimum)
```soql
SELECT Id, Subject, Description, Status, ActivityDate, OwnerId, Owner.Name,
       CreatedDate, LastModifiedDate, WhoId, Who.Name
FROM Task
WHERE WhatId = '[OppId]'
  AND CreatedDate >= LAST_N_DAYS:90
ORDER BY ActivityDate DESC
LIMIT 100
```
Don't filter to "Open" only. Completed tasks often have description fields with commitments that were logged but never properly closed out.

### 1d. Events (meetings, calls logged as events)
```soql
SELECT Id, Subject, Description, StartDateTime, EndDateTime,
       OwnerId, Owner.Name, CreatedDate
FROM Event
WHERE WhatId = '[OppId]'
  AND StartDateTime >= LAST_N_DAYS:90
ORDER BY StartDateTime DESC
LIMIT 50
```

### 1e. Activity history via SOSL (call logs, emails logged in Salesforce)
Use `salesforce_search_all` with the opportunity name and account name as search terms to catch any activity records that might be linked differently (e.g., logged against the account rather than the opp directly).

Also query:
```soql
SELECT Id, Subject, Description, ActivityDate, Status, OwnerId, Owner.Name
FROM Task
WHERE WhatId = '[AccountId]'
  AND CreatedDate >= LAST_N_DAYS:90
ORDER BY ActivityDate DESC
LIMIT 50
```

This catches tasks logged at the account level that are still relevant to the deal.

## Step 2 — Search Gmail

You now have the customer contact email addresses. Use them to find recent email threads.

### 2a. Search by each contact's email address
For each contact email, run:
```
gmail_search_messages: from:[contact@domain.com] OR to:[contact@domain.com] newer_than:60d
```

### 2b. Search by company/account name
Also search by the account name to catch threads where the email address might differ:
```
gmail_search_messages: [Account Name] newer_than:60d
```

### 2c. Read the threads
For promising threads (subject lines suggesting deal-related conversation — pricing, timelines, contracts, renewals, follow-ups), use `gmail_read_thread` to get the full content. Read at least the 5 most recent threads. Don't skip threads just because they're older — a commitment made 45 days ago and not yet closed is still an action.

## Step 3 — Synthesise into an action list

Now read everything you've gathered and extract every **committed action** — things that:
- Someone agreed to do ("I'll send you the revised proposal by Friday")
- Are explicitly flagged as open ("Next step: Legal review")
- Appear in task records with open status
- Were mentioned in emails and have no corresponding closed task
- Appear in the opp Description or NextStep fields

### What counts as an action
Be inclusive rather than exclusive. If something looks like a commitment, flag it. Better to show a rep something they already handled than to miss something live.

Does NOT count: general context, relationship background, completed items that are clearly done with no follow-on needed.

### Output format

Produce the output in this exact structure:

---

## Action List — [Opportunity Name] | [Account Name]
*As of [today's date] | Stage: [Stage] | Renewal Date: [Renewal_Date__c] (contractual) | Close Date: [CloseDate] (internal tracking)*

---

### 🔴 High Priority
*(Overdue, time-sensitive, or blocking the deal)*

| # | Action | Owner | Due | Source |
|---|--------|-------|-----|--------|
| 1 | [Specific action] | [Name or "unclear"] | [Date or "not specified"] | [e.g., Email 3 Apr, SF Task, Opp Description] |

### 🟡 Medium Priority
*(Committed but not immediately urgent)*

| # | Action | Owner | Due | Source |
|---|--------|-------|-----|--------|

### 🟢 Low Priority / Watch
*(Mentioned but loosely worded, or longer-horizon items)*

| # | Action | Owner | Due | Source |
|---|--------|-------|-----|--------|

---

### Context Notes
*Brief summary (3–5 sentences) of where the deal stands, who the key contacts are, and anything the rep should know before acting on the list above.*

---

## Priority logic

Assign priority using this reasoning (explain to yourself, don't show this to the user):
- **High**: Due date has passed, or it's explicitly blocking next steps, or the customer is waiting on it
- **Medium**: Has a clear due date in the future, or was explicitly committed to in email/call
- **Low**: Vague mentions, "it would be good to", longer-horizon planning items

When assessing time pressure and urgency, always reason against the **Renewal Date** (`Renewal_Date__c`) — this is the contractual deadline. The Close Date (`CloseDate`) is an internal milestone and should not be used to represent urgency to the rep.

When due dates are absent, use the recency and context of the source to infer urgency.

## Important principles

**Be honest about source.** Always note where each action came from. A rep needs to know whether something is a formal SF task or an off-hand email comment — they're different levels of commitment.

**Don't fabricate.** If you can't find enough data (e.g., the opp is very new or connectors return nothing), say so clearly. An empty list with a clear explanation is more useful than a padded list.

**Don't collapse duplicates silently.** If the same action appears in both an email and a task, list it once but note both sources — that double-sourcing actually signals it's important.

**Prioritise recency but don't ignore history.** An action committed 8 weeks ago with no resolution is more important than a vague mention from yesterday.
