-- AI Configuration Schema for Core Renewals Platform
-- Run this in the Supabase SQL editor.
-- Stores AI knowledge base, prompt templates, and behavior settings.

-- ── AI Knowledge Base ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  content     TEXT NOT NULL,
  category    TEXT DEFAULT 'general',
  priority    TEXT DEFAULT 'when_relevant',
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── AI Prompt Templates ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature       TEXT NOT NULL,
  name          TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  model         TEXT DEFAULT 'gpt-4o',
  temperature   FLOAT DEFAULT 0.7,
  variables     JSONB,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── AI Settings (key-value) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE ai_knowledge_base   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_ai_knowledge_base"   ON ai_knowledge_base   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ai_prompt_templates" ON ai_prompt_templates FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ai_settings"         ON ai_settings         FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_ai_knowledge_base"   ON ai_knowledge_base   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_ai_prompt_templates" ON ai_prompt_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_ai_settings"         ON ai_settings         FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_kb_active   ON ai_knowledge_base(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_kb_category ON ai_knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_ai_kb_priority ON ai_knowledge_base(priority);
CREATE INDEX IF NOT EXISTS idx_ai_pt_feature  ON ai_prompt_templates(feature);
CREATE INDEX IF NOT EXISTS idx_ai_pt_active   ON ai_prompt_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_settings_key ON ai_settings(key);

-- ── Seed: Business Rules Knowledge Base Doc ────────────────────────────────
INSERT INTO ai_knowledge_base (name, description, content, category, priority, is_active) VALUES
(
  'Core Business Rules — Pricing & Negotiation',
  'Critical pricing rules and approved strategies that ALL AI-generated content must respect. Include on every generation.',
  '## Pricing Rules (Non-Negotiable)

- 25/35/45 pricing is non-negotiable. 25% standard, 35% gold, 45% platinum. Zero rep discretion. Zero exceptions.
- Never negotiate on price. But let customers "win" with non-price concessions: free seats, modules, payment terms, Prime/Unlimited access, multi-year price lock.
- Standard terms only: 1, 3, or 5 years. Nothing shorter or longer.
- No seat/license reductions. Requesting reduction triggers repricing to full list.
- No contract redlining under $100K TCV. Accept losing sub-$100K customers who refuse standard paper.
- Auto-renewal enforces engagement. AR quote = list price + 50% penalty. Offer quote = discounted. Customer engagement is rewarded.

## Approved Pricing Strategies

- Standard 25/35/45
- Flat 4 (maintenance, credible churn, 4yr)
- 1st Year Flat/Ramp
- Free/Unlimited Seats (3-5yr HVO)
- Multiyear Platinum Reduced (35%, >$1M ARR, 3-5yr)

## Communication Rules

- Value-based communication reduces churn by 40% vs cost-based justifications.
- All AI-generated content must lead with value/ROI, never apologise for pricing.
- Never reference internal pricing strategy or margins to customers.
- Position price increases as industry-standard and tied to continued product investment.',
  'pricing_rules',
  'always_include',
  true
);

-- ── Seed: Prompt Templates (extracted from generate/route.ts) ──────────────
INSERT INTO ai_prompt_templates (feature, name, system_prompt, model, temperature, variables) VALUES
(
  'email',
  'Email Draft Generator',
  'You are a renewals account executive writing follow-up emails. Write professional but warm emails that reference specific details from the opportunity and activity history. Be concise — 3-5 short paragraphs max. Never invent facts not in the context. Sign off with just the rep''s first name.

Return your response as JSON with exactly two fields:
{"subject": "...", "body": "..."}',
  'gpt-4o',
  0.7,
  '["opportunity_name","account_name","owner","stage","arr","renewal_date","close_date","last_contact_date","days_since_renewal_call","queue_status","flag_reason","health_score","churn_risk","description","activity_history"]'::jsonb
),
(
  'summary',
  'Deal Summary Generator',
  'You are a renewals intelligence analyst. Write a concise 3-4 sentence briefing note in plain English. Cover: where the deal stands, any risks or urgency, and what the rep should focus on next. Do not use bullet points — write flowing sentences.',
  'gpt-4o',
  0.7,
  '["opportunity_name","account_name","owner","stage","arr","renewal_date","close_date","last_contact_date","days_since_renewal_call","queue_status","flag_reason","health_score","churn_risk","description","activity_history"]'::jsonb
),
(
  'call_objective',
  'Call Objective Generator',
  'You are a renewals coach. Write a concise paragraph (3-5 sentences) on what the rep should achieve on the next call with this customer. Be specific and actionable based on the deal context.',
  'gpt-4o',
  0.7,
  '["opportunity_name","account_name","owner","stage","arr","renewal_date","close_date","last_contact_date","days_since_renewal_call","queue_status","flag_reason","health_score","churn_risk","description","activity_history"]'::jsonb
),
(
  'question',
  'AI Chat Assistant',
  'You are a renewals intelligence analyst helping a rep understand a specific opportunity. Answer questions concisely and specifically using only the opportunity context provided. Be direct and actionable. Use plain English, not jargon. Keep answers to 2-4 sentences unless the question requires more detail.',
  'gpt-4o',
  0.7,
  '["opportunity_name","account_name","owner","stage","arr","renewal_date","close_date","last_contact_date","days_since_renewal_call","queue_status","flag_reason","health_score","churn_risk","description","activity_history","conversation_history"]'::jsonb
);

-- ── Seed: Default AI Settings ──────────────────────────────────────────────
INSERT INTO ai_settings (key, value) VALUES
  ('default_model_email', '"gpt-4o"'::jsonb),
  ('default_model_summary', '"gpt-4o"'::jsonb),
  ('default_model_call_objective', '"gpt-4o"'::jsonb),
  ('default_model_question', '"gpt-4o"'::jsonb),
  ('default_temperature', '0.7'::jsonb),
  ('reasoning_effort', '"high"'::jsonb),
  ('response_length', '"concise"'::jsonb),
  ('tone_override', '"professional"'::jsonb),
  ('include_description', 'true'::jsonb),
  ('include_activity_history', 'true'::jsonb),
  ('include_support_tickets', 'false'::jsonb),
  ('max_activity_count', '50'::jsonb)
ON CONFLICT (key) DO NOTHING;
