# call-plan

A Claude Cowork skill that generates personalised call preparation materials for customer calls. Given a **customer name** and a **call type**, it pulls live context from Salesforce, Gmail, and Google Calendar, then produces two ready-to-use outputs: a structured Excel call plan and an interactive HTML call assistant for use during the live call.

---

## What it produces

**1. Excel Call Plan** (`CallPlan_{Customer}_{CallType}_{Date}.xlsx`)

A fully populated call plan workbook based on the Core Renewals template. Includes a deal information block (SF opportunity, ARR, renewal date, contacts, addresses) and a structured call flow with personalised talking points drawn from recent email context.

**2. HTML Call Assistant** (`CallAssistant_{Customer}_{CallType}_{Date}.html`)

A self-contained single-page web app the rep opens in their browser during the call. Collapsible cards for the deal brief and each call stage show **only the personalised content** (not boilerplate). Includes a sticky header + stage nav, deal brief with Gmail sentiment signals, objection-handling accordions, a back-to-top button, and an urgency banner if the renewal date is within 30 days.

---

## Supported call types

The skill supports **seven** call types and maps user phrasing onto the template sheet names below.

| User says | Template sheet name |
|---|---|
| Check-in / check-in call (standard / not new acquisition) | `Call type Check-In Call (NOT ne` |
| Check-in (post acquisition / post-acq) | `Call type Check-In Call (Post-a` |
| Check-in (reseller) | `Call Type Check-In Call (Resell` |
| Renewal / renewal call (standard / not new acquisition) | `Call Type Renewal Call (NOT new` |
| Renewal (new acquisition / new acq) | `Call Type Renewal Call (new acq` |
| Follow-up / follow up call | `Call Type Follow-Up Call` |
| Cancellation / cancellation call | `Call Type Cancellation Call` |

---

## Prerequisites

Each team member must have the following set up independently before the skill will work. **None of these are included in this repo** — they are personal to each user.

### 1. Salesforce MCP Server

The skill uses the Salesforce MCP server to query opportunities and accounts directly — it does not use browser-based Salesforce navigation.

- Install from: `https://github.com/tsmztech/mcp-server-salesforce`
- Requires your own Salesforce credentials / connected app token
- Add the server to your `claude_desktop_config.json` under `mcpServers`
- Your token must never be committed to this repo

### 2. Gmail Connector

Connected via Claude Cowork's built-in Gmail integration (OAuth). Ensure Gmail is connected in your Cowork account settings before running the skill.

### 3. Google Calendar Connector

Connected via Claude Cowork's built-in Google Calendar integration (OAuth). Ensure Calendar is connected in your Cowork account settings.

---

## Repo structure

```
call-plan/
├── README.md                        ← this file
├── SKILL.md                         ← skill instructions read by Claude at runtime
└── references/
    └── call_plan_templates.xlsx     ← shared call plan template (all call types)
```

---

## Installation

### 1. Clone this repo

```bash
git clone https://github.com/timcourtenay-hub/call-plan
```

### 2. Copy (or symlink) the skill folder into your Cowork skills directory

**Option A — Manual copy** (simplest, update manually when the skill changes):
```bash
cp -r ~/call-plan \
      ~/Library/Application\ Support/Claude/skills/user/call-plan
```

**Option B — Symlink** (automatically reflects any `git pull` updates):
```bash
# Back up your existing skill first
mv ~/Library/Application\ Support/Claude/skills/user/call-plan \
   ~/Library/Application\ Support/Claude/skills/user/call-plan-backup

# Create the symlink
ln -s ~/call-plan \
      ~/Library/Application\ Support/Claude/skills/user/call-plan
```

### 3. Restart Cowork

Cowork loads skills on startup. Restart the app after installing.

### 4. Verify

In a Cowork chat, type:
> *"Call plan for [any customer name] — renewal call"*

Claude should confirm the customer name and call type, then proceed automatically.

---

## Usage

Trigger the skill with any of these phrases:

- `"Call plan for Acme Corp — renewal call"`
- `"Prep a call plan for NBN Co"`
- `"Create a call plan"` *(Claude will ask for customer and call type)*
- `"Build my call plan for AmBank — check-in"`

Claude will always confirm the **customer name** and **call type** before starting. If either is missing, it will ask before proceeding — it will not generate outputs without both.

---

## What the skill does (high level)

Once customer name + call type are confirmed, the skill:

- **Gathers customer context in parallel** from Salesforce, Gmail, and Calendar
- **Loads the matching sheet** from the template workbook at `/mnt/skills/user/call-plan/references/call_plan_templates.xlsx`
- **Builds a personalised Excel call plan** by filling the information block and replacing placeholders across the call flow (leaving `[Not found]` when data is missing)
- **Builds a personalised HTML call assistant** designed for live use during the call (collapsed cards, stage navigation, deal brief, and personalised talking points only)
- **Presents both files together**, plus a short bullet summary of key signals (SF/Gmail/Calendar), including whether the primary contact is on the calendar invite

---

## Updating the skill

When the skill is updated in this repo:

**If you used a symlink**: just run `git pull` in `~/call-plan/` — no further steps needed.

**If you used a manual copy**: re-copy the updated folder:
```bash
cp -r ~/call-plan \
      ~/Library/Application\ Support/Claude/skills/user/call-plan
```

Then restart Cowork.

---

## Contributing changes

1. Create a branch: `git checkout -b dev/call-plan-your-change`
2. Make your edits to `SKILL.md` or `references/`
3. Test locally — run at least one call plan end-to-end and verify both outputs
4. Open a pull request against `main` with a brief description of what changed and why
5. Get one team member to review before merging

**Do not commit** any personal data, customer names, API tokens, or Salesforce credentials.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Skill doesn't trigger | Cowork hasn't been restarted since install, or the folder path is wrong |
| Salesforce returns no data | MCP server not running, or your SF token has expired |
| Template not found | `references/call_plan_templates.xlsx` missing from the skill folder |
| Gmail returns nothing | Gmail connector not authorised in Cowork account settings |
| Calendar event not found | Normal — the skill notes this and continues; check your calendar manually |
