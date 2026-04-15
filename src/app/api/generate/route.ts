import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Hardcoded fallbacks (used if Supabase is empty/unreachable) ──────────────

const FALLBACK_PROMPTS: Record<string, string> = {
  email: `You are a renewals account executive writing follow-up emails. Write professional but warm emails that reference specific details from the opportunity and activity history. Be concise — 3-5 short paragraphs max. Never invent facts not in the context. Sign off with just the rep's first name.

Return your response as JSON with exactly two fields:
{"subject": "...", "body": "..."}`,
  summary:
    "You are a renewals intelligence analyst. Write a concise 3-4 sentence briefing note in plain English. Cover: where the deal stands, any risks or urgency, and what the rep should focus on next. Do not use bullet points — write flowing sentences.",
  call_objective:
    "You are a renewals coach. Write a concise paragraph (3-5 sentences) on what the rep should achieve on the next call with this customer. Be specific and actionable based on the deal context.",
  call_prep: `You are a senior Enterprise Renewal Manager preparing for a customer call. Generate a structured call preparation document using the MEDDPICCS framework and SPIN selling methodology.

Structure your output as:
1. DEAL BRIEF — 3-4 sentence summary of where the deal stands, key risks, and ARR at stake
2. CALL OBJECTIVES — 2-3 specific outcomes to achieve on this call
3. MEDDPICCS ASSESSMENT — for each letter (Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, Champion, Competition, Services), note what you know and what gaps need filling
4. TALKING POINTS — 3-5 specific topics to cover, with context from activity history and support tickets
5. SPIN QUESTIONS — 2-3 questions per category (Situation, Problem, Implication, Need-Payoff) tailored to this deal
6. OBJECTION PREP — likely objections based on deal context and prepared responses (using approved strategies: free seats, payment terms, Prime/Unlimited, multi-year price lock)
7. RED FLAGS — any risks from support tickets, churn signals, or missed gates that need addressing

Be specific. Reference actual data from the opportunity context. Never fabricate information not in the context.`,
  question:
    "You are a renewals intelligence analyst helping a rep understand a specific opportunity. Answer questions concisely and specifically using only the opportunity context provided. Be direct and actionable. Use plain English, not jargon. Keep answers to 2-4 sentences unless the question requires more detail.",
};

const EMAIL_TYPE_LABELS: Record<string, string> = {
  chase_quote_signature: "Chase quote signature",
  request_followup_call: "Request follow-up call",
  checkin_no_contact: "Check in — no recent contact",
  chase_legal: "Chase legal/contract review",
  renewal_reminder: "Renewal reminder",
  post_call_summary: "Post-call follow-up summary",
  escalation: "Escalation — no response",
};

// ── Supabase config fetchers ─────────────────────────────────────────────────

interface PromptConfig {
  system_prompt: string;
  model: string;
  temperature: number;
}

interface AIConfig {
  response_length: string;
  tone_override: string;
  include_description: boolean;
  include_activity_history: boolean;
  max_activity_count: number;
}

const DEFAULT_AI_CONFIG: AIConfig = {
  response_length: "concise",
  tone_override: "professional",
  include_description: true,
  include_activity_history: true,
  max_activity_count: 50,
};

async function fetchPromptConfig(feature: string): Promise<PromptConfig | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("ai_prompt_templates")
      .select("system_prompt, model, temperature")
      .eq("feature", feature)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (data) {
      return {
        system_prompt: data.system_prompt,
        model: data.model ?? "gpt-4o",
        temperature: data.temperature ?? 0.7,
      };
    }
  } catch {
    // Supabase unavailable — fall back
  }
  return null;
}

async function fetchKnowledgeBase(alwaysOnly: boolean): Promise<string> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("ai_knowledge_base")
      .select("name, content, priority")
      .eq("is_active", true);

    if (alwaysOnly) {
      query = query.eq("priority", "always_include");
    }

    const { data } = await query;
    if (data && data.length > 0) {
      return data
        .map((doc) => `--- ${doc.name} ---\n${doc.content}`)
        .join("\n\n");
    }
  } catch {
    // Supabase unavailable
  }
  return "";
}

async function fetchAIConfig(): Promise<AIConfig> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("ai_settings").select("key, value");

    if (data && data.length > 0) {
      const map: Record<string, unknown> = {};
      for (const row of data) {
        map[row.key] = row.value;
      }
      return {
        response_length: (map.response_length as string) ?? DEFAULT_AI_CONFIG.response_length,
        tone_override: (map.tone_override as string) ?? DEFAULT_AI_CONFIG.tone_override,
        include_description: (map.include_description as boolean) ?? DEFAULT_AI_CONFIG.include_description,
        include_activity_history: (map.include_activity_history as boolean) ?? DEFAULT_AI_CONFIG.include_activity_history,
        max_activity_count: (map.max_activity_count as number) ?? DEFAULT_AI_CONFIG.max_activity_count,
      };
    }
  } catch {
    // Supabase unavailable
  }
  return DEFAULT_AI_CONFIG;
}

// ── Prompt building ──────────────────────────────────────────────────────────

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAI({ apiKey });
}

function buildContext(
  opp: Record<string, unknown>,
  activityHistory: Record<string, unknown>[],
  config: AIConfig,
  supportTickets?: Record<string, unknown>[]
): string {
  const description = (opp.description as string) ?? null;
  const maxActs = config.max_activity_count ?? 50;
  const trimmedHistory = (activityHistory ?? []).slice(0, maxActs);

  const activityLines = config.include_activity_history
    ? trimmedHistory
        .map((a) => {
          const notes = (a.notes as string) ?? "";
          const truncNotes = notes.length > 300 ? notes.slice(0, 300) + "..." : notes;
          return `  - ${a.date}: [${a.type}] ${a.subject} (by ${a.performedBy})${truncNotes ? `\n    Notes: ${truncNotes}` : ""}`;
        })
        .join("\n")
    : "";

  return `OPPORTUNITY DETAILS:
- Account: ${opp.accountName}
- Opportunity: ${opp.opportunityName}
- Owner/Rep: ${opp.owner}
- Stage: ${opp.stage}
- ARR: $${Number(opp.arr ?? 0).toLocaleString()}
- Renewal Date: ${opp.renewalDate ?? "N/A"}
- Close Date: ${opp.closeDate ?? "N/A"}
- Last Contact: ${opp.lastContactDate ?? "N/A"}
- Days Since Renewal Call: ${opp.daysSinceLastRenewalCall ?? "N/A"}
- Next Step: ${opp.nextStepOwner ?? "N/A"}
- Queue Status: ${opp.queueStatus}
- Flag Reason: ${opp.flagReason}
- Health Score: ${opp.healthScore ?? "N/A"}
- Churn Risk: ${opp.churnRiskCategory ?? "N/A"}
${config.include_description && description ? `\nDESCRIPTION/NOTES:\n${description}` : ""}

ACTIVITY HISTORY (${trimmedHistory.length} entries):
${activityLines || "  No activity recorded."}${buildSupportContext(supportTickets)}`;
}

function buildSupportContext(tickets?: Record<string, unknown>[]): string {
  if (!tickets || tickets.length === 0) return "";

  const openTickets = tickets.filter(
    (t) => t.status === "open" || t.status === "new" || t.status === "pending"
  );

  const lines = tickets
    .slice(0, 20)
    .map(
      (t) =>
        `  - #${t.id}: ${t.subject} [${t.status}] (priority: ${t.priority}, requester: ${t.requester || t.requesterEmail || "unknown"}, created: ${t.createdAt || "unknown"})`
    )
    .join("\n");

  return `

SUPPORT TICKETS (${tickets.length} total, ${openTickets.length} open/pending):
${openTickets.length > 0 ? "⚠ OPEN TICKETS PRESENT — flag these as potential risks on the call.\n" : ""}${lines}`;
}

function buildSystemPrompt(
  basePrompt: string,
  knowledgeBase: string,
  config: AIConfig
): string {
  const parts: string[] = [];

  if (knowledgeBase) {
    parts.push(`REFERENCE KNOWLEDGE:\n${knowledgeBase}`);
  }

  parts.push(basePrompt);

  const modifiers: string[] = [];
  if (config.tone_override && config.tone_override !== "professional") {
    modifiers.push(`Use a ${config.tone_override} tone.`);
  }
  if (config.response_length === "detailed") {
    modifiers.push("Provide detailed, thorough responses.");
  } else if (config.response_length === "comprehensive") {
    modifiers.push("Provide comprehensive, in-depth responses covering all relevant angles.");
  }

  if (modifiers.length > 0) {
    parts.push(`\nADDITIONAL INSTRUCTIONS: ${modifiers.join(" ")}`);
  }

  return parts.join("\n\n");
}

// ── POST /api/generate ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, emailType, opportunity, activityHistory, supportTickets } = body;

    if (!type || !opportunity) {
      return NextResponse.json({ error: "Missing type or opportunity" }, { status: 400 });
    }

    const openai = getOpenAI();

    // Fetch config from Supabase (with fallbacks)
    const [promptConfig, knowledgeBase, aiConfig] = await Promise.all([
      fetchPromptConfig(type),
      fetchKnowledgeBase(true),
      fetchAIConfig(),
    ]);

    const systemPromptBase = promptConfig?.system_prompt ?? FALLBACK_PROMPTS[type] ?? FALLBACK_PROMPTS.summary;
    const model = promptConfig?.model ?? "gpt-4o";
    const context = buildContext(
      opportunity,
      activityHistory ?? [],
      aiConfig,
      supportTickets as Record<string, unknown>[] | undefined
    );
    const fullSystemPrompt = buildSystemPrompt(systemPromptBase, knowledgeBase, aiConfig);

    if (type === "email") {
      const label = EMAIL_TYPE_LABELS[emailType] ?? emailType;

      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: fullSystemPrompt },
          {
            role: "user",
            content: `Write a "${label}" email for this opportunity. The email should be from ${opportunity.owner} to the customer contact at ${opportunity.accountName}.\n\n${context}`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);

      return NextResponse.json({
        subject: parsed.subject ?? "Follow-up",
        body: parsed.body ?? "",
      });
    }

    if (type === "summary") {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: fullSystemPrompt },
          {
            role: "user",
            content: `Write an opportunity overview briefing for this renewal:\n\n${context}`,
          },
        ],
      });

      return NextResponse.json({
        text: response.choices[0]?.message?.content ?? "",
      });
    }

    if (type === "call_objective") {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: fullSystemPrompt },
          {
            role: "user",
            content: `Write a call objective for the next call on this opportunity:\n\n${context}`,
          },
        ],
      });

      return NextResponse.json({
        text: response.choices[0]?.message?.content ?? "",
      });
    }

    if (type === "call_prep") {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: fullSystemPrompt },
          {
            role: "user",
            content: `Generate a comprehensive call preparation document for the next call on this opportunity:\n\n${context}`,
          },
        ],
      });

      return NextResponse.json({
        text: response.choices[0]?.message?.content ?? "",
      });
    }

    if (type === "question") {
      const question = body.question;
      if (!question) {
        return NextResponse.json({ error: "Missing question" }, { status: 400 });
      }

      const priorMessages = (body.conversationHistory ?? []).flatMap(
        (exchange: { question: string; answer: string }) => [
          { role: "user" as const, content: exchange.question },
          { role: "assistant" as const, content: exchange.answer },
        ]
      );

      const chatSystemPrompt = `${fullSystemPrompt}\n\n${context}`;

      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: chatSystemPrompt },
          ...priorMessages,
          { role: "user", content: question },
        ],
      });

      return NextResponse.json({
        text: response.choices[0]?.message?.content ?? "",
      });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[/api/generate] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
