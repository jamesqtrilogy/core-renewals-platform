/**
 * POST /api/tasks/actions
 *
 * AI-powered action generation for an opportunity. Combines Skills 2-4 logic:
 * extracts explicit actions (SF tasks, description, NextStep) and implicit
 * actions (cadence compliance, gate checks) via AI, then consolidates.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { querySalesforce } from '@/lib/salesforce-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  return new OpenAI({ apiKey })
}

async function fetchKnowledgeBase(): Promise<string> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('ai_knowledge_base')
      .select('name, content')
      .eq('is_active', true)
      .eq('priority', 'always_include')
    if (data && data.length > 0) {
      return data.map(d => `--- ${d.name} ---\n${d.content}`).join('\n\n')
    }
  } catch { /* fallback */ }
  return ''
}

interface SfTask extends Record<string, unknown> {
  Id: string
  Subject: string | null
  Status: string | null
  ActivityDate: string | null
  Description: string | null
  Owner: { Name: string | null } | null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { opportunity } = body

    if (!opportunity?.id) {
      return NextResponse.json({ error: 'Missing opportunity' }, { status: 400 })
    }

    const safeId = opportunity.id.replace(/[^a-zA-Z0-9]/g, '')

    // Fetch open tasks for this opp
    const tasks = await querySalesforce<SfTask>(
      `SELECT Id, Subject, Status, ActivityDate, Description, Owner.Name
       FROM Task WHERE WhatId = '${safeId}' AND IsClosed = false
       ORDER BY ActivityDate ASC LIMIT 20`
    )

    const taskLines = tasks.map(t =>
      `- [${t.Status}] ${t.Subject ?? '(no subject)'} (due: ${t.ActivityDate ?? 'none'}, owner: ${t.Owner?.Name ?? 'unknown'})${t.Description ? ` — ${t.Description.slice(0, 200)}` : ''}`
    ).join('\n')

    const knowledgeBase = await fetchKnowledgeBase()

    const openai = getOpenAI()

    const today = new Date().toISOString().slice(0, 10)
    const daysToRenewal = opportunity.renewalDate
      ? Math.round((new Date(opportunity.renewalDate).getTime() - Date.now()) / 86_400_000)
      : null

    const prompt = `You are a renewal operations analyst. Analyse this opportunity and produce a consolidated action list.

OPPORTUNITY:
- Account: ${opportunity.account}
- Name: ${opportunity.name}
- Stage: ${opportunity.stage}
- ARR: $${Number(opportunity.arr ?? 0).toLocaleString()}
- Renewal Date: ${opportunity.renewalDate ?? 'N/A'}
- Days to Renewal: ${daysToRenewal ?? 'N/A'}
- Owner: ${opportunity.owner}
- Product: ${opportunity.product ?? 'N/A'}
- Next Follow-Up: ${opportunity.nextFollowUp ?? 'N/A'}
- Health Score: ${opportunity.healthScore ?? 'N/A'}
- Churn Risk: ${opportunity.churnRisk ?? 'N/A'}
- Next Step: ${opportunity.nextStep ?? 'N/A'}
- Last Activity: ${opportunity.lastActivityDate ?? 'N/A'}
${opportunity.description ? `\nDescription/Notes:\n${opportunity.description}` : ''}

OPEN SALESFORCE TASKS (${tasks.length}):
${taskLines || 'None'}

${knowledgeBase ? `REFERENCE KNOWLEDGE:\n${knowledgeBase}` : ''}

TODAY: ${today}

INSTRUCTIONS:
1. EXPLICIT ACTIONS: Extract every outstanding committed action from the Description, NextStep, and open Tasks. Each must have a source (e.g. "NextStep field", "Open Task #123").
2. IMPLICIT ACTIONS: Check this deal against the renewal cadence:
   - Gate compliance (Gate 1 at T-140, Gate 2 at T-90, Gate 3 at T-30, Gate 4 at T-0)
   - Is the stage appropriate for days-to-renewal?
   - Has a quote been sent if within 90 days?
   - Any churn risk signals that need action?
   - Platinum/Prime positioning if applicable?
3. CONSOLIDATE: Merge explicit and implicit, de-duplicate, and prioritise.

Return JSON array. Each action object:
{
  "action": "description of what to do",
  "priority": "critical" | "high" | "medium" | "low",
  "category": "email_customer" | "prepare_call" | "send_deliverable" | "update_crm" | "internal" | "watch",
  "source": "explicit" | "implicit",
  "sourceDetail": "where this came from (e.g. NextStep field, Gate 2 rule, Open Task)",
  "dueDate": "YYYY-MM-DD or null",
  "owner": "rep" | "customer" | "internal"
}

Return ONLY the JSON array, no other text.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content ?? '[]'
    let actions
    try {
      const parsed = JSON.parse(content)
      actions = Array.isArray(parsed) ? parsed : parsed.actions ?? []
    } catch {
      actions = []
    }

    return NextResponse.json({ actions })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[/api/tasks/actions] Error:', message)
    return NextResponse.json({ error: message, actions: [] }, { status: 500 })
  }
}
