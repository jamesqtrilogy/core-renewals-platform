-- Tasks & Call Prep Schema for Core Renewals Platform
-- Run this in the Supabase SQL editor.

-- ── Completed Actions (task checkmarks) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS completed_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  TEXT NOT NULL,
  action_hash     TEXT NOT NULL,
  completed_by    TEXT,
  completed_at    TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_completed_actions_unique
  ON completed_actions(opportunity_id, action_hash);

ALTER TABLE completed_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_completed_actions" ON completed_actions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_completed_actions" ON completed_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Seed: Call Prep prompt template ────────────────────────────────────────
INSERT INTO ai_prompt_templates (feature, name, system_prompt, model, temperature, variables) VALUES
(
  'call_prep',
  'Call Prep Generator (MEDDPICCS + SPIN)',
  'You are a senior Enterprise Renewal Manager preparing for a customer call. Generate a structured call preparation document using the MEDDPICCS framework and SPIN selling methodology.

Structure your output as:
1. DEAL BRIEF — 3-4 sentence summary of where the deal stands, key risks, and ARR at stake
2. CALL OBJECTIVES — 2-3 specific outcomes to achieve on this call
3. MEDDPICCS ASSESSMENT — for each letter (Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, Champion, Competition, Services), note what you know and what gaps need filling
4. TALKING POINTS — 3-5 specific topics to cover, with context from activity history and support tickets
5. SPIN QUESTIONS — 2-3 questions per category (Situation, Problem, Implication, Need-Payoff) tailored to this deal
6. OBJECTION PREP — likely objections based on deal context and prepared responses (using approved strategies: free seats, payment terms, Prime/Unlimited, multi-year price lock)
7. RED FLAGS — any risks from support tickets, churn signals, or missed gates that need addressing

Be specific. Reference actual data from the opportunity context. Never fabricate information not in the context.',
  'gpt-4o',
  0.7,
  '["opportunity_name","account_name","owner","stage","arr","renewal_date","close_date","last_contact_date","days_since_renewal_call","queue_status","flag_reason","health_score","churn_risk","description","activity_history","support_tickets"]'::jsonb
)
ON CONFLICT DO NOTHING;

-- ── Seed: Cadence Reference Card into AI Knowledge Base ────────────────────
-- NOTE: The full cadence-reference-card.md (337 lines) is too large for inline SQL.
-- Add it via the Settings > AI Configuration > Knowledge Base UI, or insert manually:
--
-- INSERT INTO ai_knowledge_base (name, description, content, category, priority, is_active)
-- VALUES (
--   'Enterprise Renewals Cadence Reference Card',
--   'Gate definitions, lifecycle timeline, pricing rules, NNR rules, churn signals, stage definitions. Required for implicit action assessment.',
--   '<paste full content of cadence-reference-card.md here>',
--   'process_cadence',
--   'always_include',
--   true
-- );
--
-- The file is at: skills/daily-action-list-main/.../renewal-implicit-actions/cadence-reference-card.md
