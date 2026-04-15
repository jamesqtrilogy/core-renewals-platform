# Enterprise Renewals Cadence Reference Card
> Source: Trilogy / IgniteTech Core Renewals and Enterprise Renewals Playbooks  
> Purpose: Reference document for renewal opportunity assessment, gate compliance, and action prioritisation  
> Version: 1.0 — April 2026

---

## 1. Deal Classification

### HVO vs Non-HVO

| Attribute | HVO | Non-HVO |
|---|---|---|
| ARR threshold | ≥ $100K, or manually flagged "Treat as High Value" | < $100K |
| Managed by | Enterprise Renewal Manager (ERM) | Inside Sales Representative (ISR) |
| Prep ownership | Sales Ops | SDR |
| Contract redlining | Permitted | Strictly prohibited |
| Quote creation | Sales Ops | SDR |
| Engagement approach | Warm intro via AM required before ERM contacts customer | SDR contacts directly |
| Legal review | Required for non-standard/legacy terms | Not permitted for sub-$100K |
| Auto-renewal quote | Suppressed if toxic AR clause; NNR required instead | Standard AR process |

---

## 2. The Renewal Lifecycle — Full Timeline

All days are measured **backwards from the renewal date** (T-0). "T-120" means 120 days before renewal.

### Phase 1: Preparation (T-220 to T-180)

| Day | Milestone | Owner | Notes |
|---|---|---|---|
| T-220 | Opportunity Preparation begins | SDR (non-HVO) / Sales Ops (HVO) | Check documents, contacts, AR clause, quotes ready |
| T-210 | HVO contract pre-review | Sales Ops + Legal | Review for toxic T&C, AR language, price caps |
| T-190 | ERM HVO Opportunity Review | ERM | First ERM assessment of deal complexity |
| T-185 | HVO warm introduction | ERM via AM | AM must send intro via Account Chatter before ERM contacts customer |
| T-180 | Customer communications begin | SDR (non-HVO automated) / ERM (HVO) | Automated sequences activated for non-HVO; ERM direct for HVO |
| T-170 | Check-in call | SDR / ERM | First substantive contact attempt |

### Phase 2: Engagement (T-140 to T-100)

| Day | Milestone | Owner | Notes |
|---|---|---|---|
| **T-140** | **GATE 1 — Customer Engagement** | SDR / ERM | Primary Contact must be confirmed via email or phone. If no engagement: SDR takes ownership of outreach. Renewal plan updated. |
| T-120 | Formal Renewal Call | ERM | Structured call covering usage, pricing expectations, stakeholders, timeline. For HVO: begin MEDDPICC qualification. |
| T-100 | Contract & signatory verification | Sales Ops + Legal | Confirm signatory authority, entity name, MSA status. |

### Phase 3: Commercial (T-90 to T-60)

| Day | Milestone | Owner | Notes |
|---|---|---|---|
| **T-90** | **GATE 2 — Quote Sent** | ERM / ISR | Quote must be issued. VP triggers quote to last known contact if PC still unconfirmed. SDR continues PC outreach in parallel. |
| T-75 | Follow-up engagement | ERM / ISR | First quote follow-up. Address objections. Begin Platinum/Prime pitch if applicable. |
| T-60 | Final call to action | ERM / ISR | Last opportunity to course-correct before Gate 3 risk window. Any HVO without a completed renewal pack at T-60 is classified **red by default**. |

### Phase 4: Finalisation (T-30 to T-0)

| Day | Milestone | Owner | Notes |
|---|---|---|---|
| **T-30** | **GATE 3 — Finalizing stage** | ERM / ISR | Opportunity must be in "Finalizing" stage. If not: immediate escalation by ISR or SDR required. Quote being signed. |
| T-30 | AR Invoice auto-issued | System | If customer has AR clause and has not signed, the system auto-issues an AR invoice at AR penalty pricing (see Section 5). |
| T-7 | AR execution | System | AR binding execution if no signed quote and AR clause exists. |
| T-7 | Post-renewal review begins | ERM / ISR | Final admin: PO, O2C invoice request, O2C record field populated. |
| **T-0** | **GATE 4 — Renewal Date** | VP | Opportunity must be Closed Won. If still open: **compliance violation**. |
| T+1 | Flagged "Not Closed" | System | Automatic compliance flag raised. |

---

## 3. Gate Definitions and Failure Protocol

### Gate 1 — T-140: Customer Engagement
- **Pass criteria:** Primary Contact confirmed via email or phone call.
- **Fail action:** SDR takes ownership of outreach immediately. ERM escalates to VP if SDR cannot establish contact within 7 days.
- **Escalation owner:** SDR → ERM → VP

### Gate 2 — T-90: Quote Sent
- **Pass criteria:** At least one formal quote has been sent to the customer.
- **Fail action:** VP triggers quote to last known contact. SDR continues PC confirmation outreach.
- **Note:** A Gate 2.5 tracking window (T-90 to T-31) monitors VP-forced quotes where PC is still unverified.
- **Escalation owner:** VP triggers; SDR executes outreach

### Gate 3 — T-30: Finalizing
- **Pass criteria:** Opportunity is in "Finalizing" stage in Salesforce.
- **Fail action:** Immediate escalation by ISR or SDR. Treat as honesty failure — indicates accumulated avoidance from earlier in the cycle.
- **Escalation owner:** ISR / SDR → ERM → VP → SVP (for HVO)

### Gate 4 — T-0: Closed
- **Pass criteria:** Opportunity is Closed Won or Closed Lost.
- **Fail action:** Classified as compliance violation. VP reviews daily.
- **Escalation owner:** VP

---

## 4. Salesforce Stage Definitions

| Stage | Meaning | Typical day range |
|---|---|---|
| Pending | >120 days out, no action needed | T-220 to T-121 |
| Outreach | Automated sequence active (non-HVO only) | T-180 to T-141 |
| Engaged | Customer has responded (email or call scheduled/held) | T-140 to T-91 |
| Proposal | Quote(s) shared; customer evaluating | T-90 to T-61 |
| Quote Follow-Up | Final quote sent; follow-up sequence triggered | T-90 to T-31 |
| Finalizing | Customer signed or cancellation initiated; admin steps underway | T-30 to T-1 |
| Closed Won | Quote signed + O2C Invoice Request processed + O2C Record field populated | T-0 |
| Closed Lost | Customer cancelled + evidence captured + VP approval obtained + O2C record processed | T-0 |
| Won't Process | Invalid opp (duplicate, Prime renewal, BU-handled, data error) — VP validation required | Any |

**Stage vs. Gate alignment check (use this to assess whether an opp is on track):**

| Days to renewal | Expected minimum stage | If behind |
|---|---|---|
| >140 | Outreach / Engaged | Acceptable if Pending — check prep completion |
| 120–140 | Engaged (Gate 1 passed) | If still Outreach: escalate PC confirmation to SDR |
| 90–120 | Engaged → Quote Follow-Up | Renewal Call should have occurred; quote prep underway |
| 60–90 | Quote Follow-Up | Quote must be sent; commercial discussion active |
| 30–60 | Quote Follow-Up → Proposal | Active negotiation; Platinum/Prime pitched; closing signalled |
| 0–30 | Finalizing | Execution only — no new discovery or negotiation |

---

## 5. Pricing Rules

### Standard Uplifts (mandatory, no exceptions without VP/CEO approval)

| Success Level | Standard uplift | AR penalty uplift (if AR clause triggered) |
|---|---|---|
| Standard | 25% | 36.1% (25% + 10% penalty) |
| Gold | 35% | 48.5% (35% + 10% penalty) |
| Platinum | 45% | 59.5% (45% + 10% penalty) |

- Uplifts apply regardless of whether the customer is already at or above list price.
- Customers **cannot reduce seats, licenses, or entitlements** during renewal.
- Downgrade from Platinum to Standard is permitted, but 25% uplift still applies.

### Discount Policy — Zero Discretion
- No rep has any authority to offer a discount.
- No negotiation, no reduction, no exceptions — unless:
  - **ARR > $1M:** A 10% reduction in uplift (35% instead of 45%) is permitted if the customer commits to a 3- or 5-year Platinum contract.
  - Any other discount must be funded from CEO profit margin and requires Legal approval.

### Multi-Year Terms
- Only 1, 3, or 5 year terms are permitted. No shorter, no longer.
- Positioned as a "price-lock" — customer avoids compounding annual uplifts.
- A 3- or 5-year Platinum commitment at ARR > $1M unlocks the 10% uplift reduction above.

### Auto-Renewal Invoice Mechanics
- If customer has an AR clause and has **not** signed a quote by T-30: system auto-issues an AR penalty invoice.
- AR invoice is not final — opportunity remains open. It creates urgency.
- If customer signs the standard quote before T-0: AR invoice is overridden and penalty is avoided.
- If customer has a legacy price cap in their contract: cap must be honoured instead of AR penalty.

---

## 6. Notice of Non-Renewal (NNR) Rules

### When an NNR is required
- Contract has a **toxic AR clause** (price cap, flat rate renewal, or other term that prevents standard uplift).
- NNR must be issued to prevent the contract from auto-renewing at capped/unfavourable legacy rates.

### NNR process rules
1. ISR/ERM must speak with customer and present commercial terms **before** sending NNR.
2. NNR is only sent if:
   - Customer explicitly declines renewal terms after a conversation, **or**
   - Customer is completely unresponsive — in which case an unsolicited quote must first be sent (at T-90, or 10 days before the NNR deadline, whichever is earlier).
3. NNR must be sent **at least 15 days before the termination notice deadline**.
4. All NNRs must be initiated, batched, signed, and tracked in Salesforce — no shadow spreadsheets.
5. Once NNR is marked "Sent" in Salesforce: all automated AR outreach to the customer is suppressed.

### NNR deadline calculation
- NNR deadline = Contract notice period (typically 60 or 90 days) before renewal date.
- NNR must be sent at least 15 days before that deadline.
- **Formula:** Latest NNR send date = Renewal date − Notice period days − 15 days

---

## 7. Contract and Legal Escalation Rules

### Escalate to Legal (raise a legal case) when:
- Customer sends a breach of contract claim, termination notice, or legal threat — do **not** respond to customer; forward immediately to Legal.
- MSA redline or amendment request on any deal ≥ $100K ARR.
- Questions or proposed changes to liability caps, indemnification, or data protection/DPA.
- Legacy MSA on ESW paper dated 2019 or earlier (not yet reviewed).
- Entity or company name change request (requires proof documentation).
- New NDA, new Reseller Agreement, or Reseller Agreement > 5 years old.
- Customer signs outside Adobe Sign (requires AI verification process).
- Toxic AR clause identified — legal must confirm NNR approach.

### Do NOT escalate to Legal when:
- Deal ARR < $100K — no redlining permitted; use standard terms only.
- Contract is on Trilogy/ESW paper < 5 years old with no toxic clauses.
- Routine AR, simple quote corrections, basic seat changes.

### Escalation routing by issue type

| Issue type | Escalate to |
|---|---|
| SKU mismatch, SSP backend error, HVO quote creation | Sales Ops |
| Pricing pushback, seat reduction request, negotiation | ISR / ERM |
| Missing MSA, toxic AR clause, T&C redline | Legal |
| PO questions, invoice disputes, billing errors | Finance (O2C) |
| Gate failure, commercial exception, executive impasse | VP |
| Extension beyond 14 days on HVO | SVP + BU |

---

## 8. Extension Policy

| Extension | Max duration | Conditions | Approver |
|---|---|---|---|
| 1st extension | 14 days | Any reason; requires written intent, committed sign date, Extension Commitment Form | VP |
| 2nd extension | Up to 14 days | Unresolvable delay (legal review, PO approval, compliance, key person OOO) | VP + BU |
| Further extensions | 1 week | HVO only; extensive legal work, PO, or vendor-side delay | SVP + BU |

- If extension not approved: opportunity must be marked Closed-Lost and licenses de-provisioned.
- If delay is caused by **our internal process** (vendor registration, compliance review): license extended as standard without requiring customer commitment.

---

## 9. Churn Risk Signals and Handling

### Key churn signals (in order of severity)
1. **Customer silence** — most dangerous; silence = signal decay, not stability.
2. **1-year renewal preference after a price increase** — customer is in evaluation mode, buying time.
3. **"What's new on your roadmap?"** — vendor viability anxiety; competitive evaluation underway.
4. **No upsell requests** — internal traction eroding.
5. **High NPS + low dependency** — likes product but not strategically reliant.
6. **Reluctant or pressure-close signing** — high churn risk at next renewal.

### Churn risk categories (use for classification in SF description)
- Lack of Innovation
- Lack of ROI
- SaaSOps / Outages
- Price Rigidity
- Tech Stack Consolidation (Internal)
- Tech Stack Consolidation (M&A)
- Loss of Trust
- Loss of Use Case

### Handling a customer who wants to cancel
1. "I'm really sorry to hear that."
2. "Is your decision final, or is there anything we can do to keep you as a customer?"
3. Probe: who is the competitor, what is the exact root cause.
4. If final: direct customer to cancellations@trilogy.com for formal written cancellation.
5. **Do not offer discounts or negotiate on a cancellation call.**

### Objection handling for price increases
- Never defend the price using market conditions, inflation, or overhead — that accepts the customer's frame.
- Re-anchor to value and outcomes: "Your budget was probably built on the old system. What specifically feels misaligned with what you're getting today, and is there a gap somewhere we need to address?"
- Maintain absolute pricing discipline. Offer added value instead: Platinum services, Prime access, multi-year price lock.

### At-risk deal escalation framework (Three-Alarm)
When structural signals shift (leadership change, M&A, data discrepancies), escalate to executives immediately using:
- **Risk:** What is breaking
- **Action:** What executive involvement is required
- **Timeline:** The clock you are operating against
- **Outcome:** The expected shift if action is taken

---

## 10. Platinum and Prime

### Platinum Success
- Positioned as "automation insurance" and proactive ROI maximisation — not just support.
- Uplift: 45% (standard Platinum pricing).
- **Auto-offer rule:** Any customer receiving a price reset of 45% or greater must be offered Platinum automatically.
- Sales talk track: present as insurance against future pain, not as a cost.

### Prime
- Available to every renewal customer regardless of ARR or success level.
- Provides curated access to other portfolio products (e.g., Cloudfix, Kayako, Khoros).
- Increases platform stickiness — positions the customer within the broader product ecosystem.
- Minimum 12-month entitlement; renews at a designated floor price in subsequent years.
- Sold separately from the main renewal quote.

---

## 11. HVO Renewal Prep Checklist (Sales Ops)

Required before ERM can begin meaningful commercial engagement:

- [ ] HVO working folder created in Google Drive (named exactly after the SF Opportunity)
- [ ] Contract Report Google Sheet created
- [ ] HVO Renewal Plan Google Sheet created
- [ ] Opportunity Report refreshed in Salesforce
- [ ] Knowledge Pack assembled: opportunity timeline (.md), current contract/MSA, historical signed quotes/POs, SF Opportunity printable view (PDF), any QBR decks or critical emails
- [ ] Knowledge Pack uploaded to Google Drive HVO folder
- [ ] Contract Report generated (tabs: Hierarchy of Contracts, Summary Table, Narrative, Comparison to ESW Terms)
- [ ] HVO Renewal Plan generated (tabs: Overview, Renewal Deliverables, MEDDPICCS Table, Postmortem)
- [ ] HVO Renewal Plan URL pasted into VP Report field in Salesforce
- [ ] Contract Report Summary Table exported as PDF and uploaded to SF Opportunity Files tab

---

## 12. Closed Lost Requirements

Before marking Closed Lost in Salesforce, the following must be complete:

- [ ] Cancellation obtained in writing (email or formal notice)
- [ ] Cancellation email/screenshot attached to Opportunity Files (must show sender, date, clear intent)
- [ ] SF Opportunity Description updated with full notes
- [ ] Primary Loss Reason selected (root cause)
- [ ] Secondary Loss Reason(s) selected if applicable
- [ ] 'Auto-Renewed Last Term' or 'Canceled Before Renewal Cycle' checkbox ticked if relevant
- [ ] VP approval obtained (triggered automatically when rep clicks 'Lost')
- [ ] O2C Record Maintenance ticket submitted to terminate NetSuite subscription
- [ ] O2C Record field in Salesforce populated with delivered ticket link
- [ ] De-provisioning ticket raised with Central Support (Kayako)

---

## 13. Quick Reference — Priority Assessment Logic

Use this to determine urgency when assessing a set of opportunities:

### Priority 1 — Critical (act today)
- Hard contractual deadline within 3 days (NNR, SOW expiry, license extension expiry, AR notice)
- Customer has signed; counter-signature or execution is all that remains
- Gate 4 violation (renewal date passed, opp still open)

### Priority 2 — High (act this week)
- Gate 3 failure risk (< 30 days to renewal, not in Finalizing)
- Action required today has a multi-week lead time (supplier onboarding, novation, legal case)
- Gate 1 failure (T-140 passed with no confirmed primary contact)
- HVO > $500K with no active commercial engagement at < 90 days

### Priority 3 — Medium (act within 2 weeks)
- Behind gate cadence but not yet at risk of a gate failure
- Customer unresponsive but > 30 days to next gate deadline
- Quote sent but no response; follow-up due

### Priority 4 — Monitor
- On track per cadence; next scheduled action is planned and confirmed
- Extension agreed and running; execution underway

---

*End of Cadence Reference Card v1.0*
