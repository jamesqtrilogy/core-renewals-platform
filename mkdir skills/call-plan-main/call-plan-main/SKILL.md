---
name: call-plan
description: >
  Use this skill whenever the user asks to create, prepare, or generate a call plan for a customer call.
  Trigger phrases include: "call plan for [Customer] — [call type]", "prep a call plan for [Customer]",
  "create a call plan", "prepare my call plan", "build a call plan", "generate a call plan".
  The skill produces two outputs: (1) a personalised Excel call plan by combining a standard Core Renewals
  call plan template with customer-specific data pulled from Salesforce and Gmail, and (2) an interactive
  HTML call assistant the rep can use live during the call — with expandable cards for the deal brief and
  each call flow step, showing only the personalised talking points.
  Supports seven call types: Check-In (standard, post-acquisition, reseller), Renewal (standard, new acquisition),
  Follow-Up, and Cancellation.
  IMPORTANT: Always use this skill when the user mentions "call plan". If the call type is not specified,
  ask for it before proceeding. Never attempt to produce a call plan without knowing the call type.
---

# Call Plan Skill

Produces two outputs for every customer call:
1. **A personalised Excel call plan** — full structured template with information block, call flow, and personalised talking points.
2. **An interactive HTML call assistant** — a clean, card-based web page the rep opens in their browser during the live call, showing only the personalised content in an easy-to-navigate format.

---

## Step 0 — Confirm Required Inputs

Before doing anything else, confirm you have both:
1. **Customer name** — who the call is with
2. **Call type** — one of the seven below

If either is missing, ask for it. Do not proceed without both.

### The seven call types (map user input to these exactly):

| User says | Template sheet name |
|-----------|-------------------|
| Check-in / check-in call (standard / not new acquisition) | `Call type Check-In Call (NOT ne` |
| Check-in (post acquisition / post-acq) | `Call type Check-In Call (Post-a` |
| Check-in (reseller) | `Call Type Check-In Call (Resell` |
| Renewal / renewal call (standard / not new acquisition) | `Call Type Renewal Call (NOT new` |
| Renewal (new acquisition / new acq) | `Call Type Renewal Call (new acq` |
| Follow-up / follow up call | `Call Type Follow-Up Call` |
| Cancellation / cancellation call | `Call Type Cancellation Call` |

---

## Step 1 — Gather Customer Data

Run Salesforce, Gmail, and Calendar lookups in parallel.

### 1a. Salesforce lookup

**Access method**: Always use the Salesforce MCP server tools (e.g. `salesforce_query_records`, `salesforce_search_all`) to retrieve Salesforce data. Do not use Google Chrome or any browser-based navigation to access Salesforce — the MCP server is faster, more reliable, and doesn't require a UI session.

Search for the Salesforce Opportunity first, then the Account. Extract:
- **Account/company name**
- **Opportunity name** — the display name as it appears in Salesforce
- **Opportunity URL** — the full direct URL to the Salesforce opportunity record (used to create a hyperlink in the output)
- **Product name** (maps to `{Product}` placeholder)
- **Renewal date** / contract end date
- **Current ARR**
- **Opportunity stage**
- **Primary customer contact name** (maps to `{customer name}`)
- **Customer PoC / main contact email**
- **Billing address**
- **Shipping address**
- **AM name** (Account Manager) — retrieve this from the **Account record**, not the Opportunity. Navigate to the Account record linked from the Opportunity, and look for the Account Manager field there. This is a group employee responsible for the customer account. Do not use the Opportunity owner or your own name as a fallback.
- **Any open issues, risks, or notes on the opportunity**

If Salesforce returns no match, note what's missing and fall back to Gmail for those fields.

### 1b. Gmail lookup

Search for all recent email threads involving the customer (use company name + known contact names as search terms). Look back at least 60 days. Extract:

- **Agenda items** — anything explicitly agreed to be discussed on the call
- **Open issues** — support cases, unresolved complaints, outstanding requests
- **Customer sentiment** — positive signals, concerns, frustrations
- **Key topics likely to come up** — based on recent conversation themes
- **Any upcoming deadlines or time-sensitive items** the rep should be aware of

The goal is full situational awareness. Even if a topic wasn't formally added to the agenda, if it's been active in email recently, the rep needs to know and should proactively address it.

### 1c. Calendar lookup

Google Calendar's free-text search (`q` parameter) does not reliably support compound OR queries across multi-word phrases — a query like `"Acme Corp OR John Smith"` may silently return zero results even when a matching event exists. To avoid missing the meeting, always run **two calendar searches in parallel** and merge the results:

1. **Keyword search** — use just the customer's first and last name as a simple, single-term query (e.g. `"George Woods"`), with a timeMin of today and a timeMax 60 days out. Keep the query short; avoid OR operators or company names here.
2. **Date-range scan** — run a second call with **no `q` parameter at all**, covering today through the next 60 days. This returns all events in the window regardless of title, and acts as a safety net if the keyword search comes back empty.

Deduplicate the combined results by event ID, then filter for events whose title, description, or attendee list contains the customer's name or company name. Take the soonest matching event.

From the event, extract:
- **Meeting title and scheduled date/time**
- **Full attendee list** (names and email addresses)

Then cross-reference the attendee list against the primary customer contact identified in Step 1a (Salesforce) or 1b (Gmail). Specifically:
- **If the primary contact is present**: note this — no action needed.
- **If the primary contact is absent**: flag this clearly. This is an important heads-up for the rep — they may need to re-confirm attendance or adjust their approach if a different contact is joining instead.
- **If no matching calendar event is found after both searches**: note this in the summary so the rep is aware, and report which search method(s) were tried so the rep can investigate manually if needed.

---

## Step 2 — Load the Template

Read the template file at:
`/mnt/skills/user/call-plan/references/call_plan_templates.xlsx`

Load the sheet matching the call type selected in Step 0. Use openpyxl with `data_only=False` to preserve formulas and formatting metadata. Also read the openpyxl cell styles to replicate background colours, fonts, and column widths in the output.

Also read the xlsx skill for output guidance:
`/mnt/skills/public/xlsx/SKILL.md`

---

## Step 3 — Build the Personalised Call Plan (Excel)

Create a new Excel workbook with a single sheet. The layout must match the source template exactly — same structure, same column layout, same section order.

### 3a. Populate the information block (top of sheet)

The template has a data/information block near the top (rows ~8–16 depending on call type). Fill in every field you have data for:

| Template field | Source |
|---------------|--------|
| SF Opp | Salesforce opportunity name, as a hyperlink to the Salesforce opportunity record. Use openpyxl's `cell.hyperlink` to set the URL and `cell.value` to set the display text — the display text must match the opportunity name exactly as it appears in Salesforce. Style the cell with standard hyperlink formatting: blue font colour (`0563C1`) and underline. |
| SF Account | Salesforce account name |
| Customer PoC | Primary contact name from SF or Gmail |
| Renewal date | SF opportunity close/renewal date |
| Current ARR | SF opportunity ARR field |
| Company billing address | SF account billing address |
| Shipping address | SF account shipping address |
| AM name | Account Manager field on the **SF Account record** (navigate there from the Opportunity). This is a group employee — do not substitute the Opportunity owner or the call rep's own name. |
| Product info | Product name from SF |

Leave any field blank with a visible placeholder `[Not found]` if data is unavailable — never silently omit.

### 3b. Replace placeholders in the call flow

Throughout the call flow rows, replace all template placeholders with customer-specific values:

| Placeholder | Replace with |
|-------------|-------------|
| `{Product}` | Actual product name |
| `{Account}` | Customer company name |
| `{customer name}` | Primary contact name |
| `{name, position}` | Tim Courtenay, VP Sales — Enterprise Renewals |
| `{expiry date}` | Renewal date |

### 3c. Personalise the "Examples" column

The rightmost content column contains example questions and talking points. For each call stage, review the Gmail and Salesforce context and personalise the examples where possible:

- **If there's a relevant open issue**: add a tailored acknowledgement line (e.g. "I know we've had some challenges with X recently — I want to address that directly today.")
- **If a specific agenda item was agreed via email**: reference it explicitly in the Agenda step
- **If customer sentiment signals a concern**: weight the discovery questions toward that topic
- **If there's no useful context**: leave the minimum quality bar examples from the template unchanged — do not invent personalisation

Always maintain the minimum quality bar — personalisation adds to it, never replaces it.

### 3d. Formatting rules

- Match the source template's font, column widths, row heights, and cell shading as closely as possible
- Use Arial font throughout
- Section header rows should use the same background colour as the template
- The Examples/talking points column should have a light yellow fill (`FFFEF3`) to visually distinguish personalised content from the template baseline
- Wrap text in all content cells
- **Talking points and questions must be individually identifiable**: where a cell contains multiple talking points or suggested questions, separate each one with a numbered prefix (e.g. `1.`, `2.`, `3.`) and a line break (`\n`) between each item. This applies to all content columns — not just the Examples column. The goal is that someone glancing at a cell can instantly tell how many distinct points it contains and where one ends and the next begins.

---

## Step 4 — Save the Excel File

Save the Excel output as:
`/mnt/user-data/outputs/CallPlan_{CustomerName}_{CallType}_{Date}.xlsx`

Where:
- `{CustomerName}` = customer name with spaces replaced by underscores
- `{CallType}` = short call type label (e.g. `CheckIn`, `Renewal`, `Cancellation`)
- `{Date}` = today's date in YYYYMMDD format

Do not present this file yet — proceed directly to Step 5 to build the HTML call assistant, then present both files together in Step 6.

---

## Step 5 — Build the HTML Call Assistant

This is a self-contained single-file HTML page the rep opens in their browser during the live call. Its purpose is fast, heads-up reference — the rep should be able to glance at it mid-conversation and immediately find what they need. It is not a copy of the Excel sheet; it shows only the **personalised content**, not the minimum quality bar or standard examples.

Save the file as:
`/mnt/user-data/outputs/CallAssistant_{CustomerName}_{CallType}_{Date}.html`

### 5a. Page structure

The page has four sections, in order:

1. **Header** — account name, call type, meeting time and platform (from calendar), urgency banner if the renewal date is within 30 days
2. **Stage navigation bar** — a horizontal strip of clickable pills (Brief, one per call stage) that smooth-scroll to the relevant section
3. **Deal Brief card** — the information block, collapsed by default
4. **Call flow cards** — one card per call stage, collapsed by default

### 5b. Deal Brief card

This card contains all the structured data from the information block. Lay it out as a two-column grid of info tiles, each tile having a small uppercase label and a value. Include:

- SF Opportunity (as a clickable hyperlink)
- Opportunity stage
- Customer PoC (name, title, email)
- Renewal date (highlight in red if within 30 days)
- Current ARR
- Quote / TCV (if available)
- Product
- Account Manager
- Billing address
- Shipping address
- Call date, time, and platform
- Attendee list — show each attendee as a row with initials avatar, name, title, and RSVP status chip (green "Accepted" or amber "Pending") based on calendar data

Below the grid, include any key signals from Gmail — important recent emails, sentiment indicators, or flags — as callout boxes. Use visual hierarchy to distinguish positive signals (green), caution items (amber), and risks (red).

### 5c. Call flow cards

Create one card per call stage from the template (e.g. Call Setup, Discovery, Renewal Process, Objection Handling, Next Steps). Each card shows **only the personalised talking points** for that stage — pulled from the personalised column of the Excel sheet. Do not include the minimum quality bar text or standard example text.

Within each card:
- Use a numbered list for talking points, with each point clearly separated
- Include suggested verbatim phrases (from the personalised content) in a visually distinct quote block style
- For **Objection Handling**: render each likely objection as its own nested accordion within the card — the rep taps an objection to reveal the tailored response
- For **Next Steps**: if the personalised content distinguishes between scenarios (e.g. "if approved" vs "if still undecided"), render them as side-by-side scenario panels
- Add any relevant callout boxes for things the rep must NOT do or raise (e.g. topics to avoid, pricing positions that are final)

### 5d. Interaction design

- All cards start **collapsed** (including Deal Brief)
- Clicking a card header expands/collapses it with a smooth animation
- Stage pills in the nav bar scroll smoothly to the relevant section when clicked
- The header and nav bar are sticky so they remain visible as the rep scrolls
- A "back to top" button appears in the bottom-right corner

### 5e. Visual style

Use a dark navy header (`#1a1a2e`) with light text — professional and easy to read on a monitor during a call. Card backgrounds are white with subtle shadows. Use colour-coded left borders on cards to distinguish call stages (e.g. blue for Setup, green for Discovery, orange for Renewal Process, red for Objections, purple for Next Steps). The personalised content area uses a warm light background (`#fffef3`) to visually distinguish it from structural chrome. All text must be legible at normal browser zoom.

---

## Step 6 — Present Both Files

Present both files to the user together using the `present_files` tool:
- The `.xlsx` call plan
- The `.html` call assistant

After presenting, give the user a brief summary (3–5 bullet points) of the key personalisation signals found — what was pulled from Salesforce, what came from Gmail, and any important situational awareness items the rep should keep in mind heading into the call. Always include a bullet on the calendar check: confirm whether the primary contact is listed as a meeting attendee, or flag if they are absent or if no calendar event was found.

---

## Error Handling

- **Salesforce returns no match**: proceed with Gmail only; note in the summary which fields are missing
- **Gmail returns no relevant threads**: note in the summary; use template defaults throughout
- **Call type is ambiguous**: ask the user to clarify before proceeding
- **Both sources return nothing**: produce the template as-is with all placeholders marked `[Not found]`, and tell the user what data to fill in manually
- **No calendar event found**: note in the summary; do not block the rest of the workflow; omit the meeting time and attendee section from the HTML header and Deal Brief
- **Primary contact not in attendee list**: flag clearly in the summary and show as "Pending / Not confirmed" in the HTML attendee list