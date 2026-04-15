/**
 * GET /api/tasks/triage?rep=James+Stothard  (or rep=all for whole team)
 *
 * Queries Salesforce for open renewal opportunities needing follow-up,
 * computes priority tiers (Critical/High/Medium/Monitor), and returns
 * a prioritised list. Translated from renewal-opportunity-triage SKILL.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { querySalesforce } from '@/lib/salesforce-api'

export const dynamic = 'force-dynamic'

const TEAM_MEMBERS = [
  'James Stothard', 'Sebastian Desand', 'Tim Courtenay',
  'James Quigley', 'Fredrik Scheike',
]

interface SfTriageOpp extends Record<string, unknown> {
  Id: string
  Name: string | null
  Account: { Name: string | null } | null
  StageName: string | null
  CloseDate: string | null
  Renewal_Date__c: string | null
  ARR__c: number | null
  Amount: number | null
  Next_Follow_Up_Date__c: string | null
  Owner: { Name: string | null } | null
  Product__c: string | null
  Probable_Outcome__c: string | null
  Description: string | null
  NextStep: string | null
  LastActivityDate: string | null
  Health_Score__c: number | null
  AI_Churn_Risk_Category__c: string | null
}

export interface TriageOpp {
  id: string
  name: string
  account: string
  stage: string
  renewalDate: string
  closeDate: string
  arr: number
  nextFollowUp: string
  owner: string
  product: string
  probableOutcome: string
  description: string | null
  nextStep: string | null
  lastActivityDate: string | null
  healthScore: number | null
  churnRisk: string | null
  daysToRenewal: number
  followUpStatus: 'overdue' | 'due_today' | 'upcoming'
  followUpOverdueDays: number
  priorityTier: 'Critical' | 'High' | 'Medium' | 'Monitor'
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000)
}

function computePriority(daysToRenewal: number, stage: string, overdueDays: number, arr: number): TriageOpp['priorityTier'] {
  const nonFinal = !['Finalizing', 'Closed Won', 'Closed Lost'].includes(stage)

  // Critical
  if (daysToRenewal <= 3) return 'Critical'
  if (daysToRenewal < 0 && nonFinal) return 'Critical'
  if (stage === 'Finalizing' && daysToRenewal <= 7) return 'Critical'

  // High
  if (daysToRenewal <= 30 && nonFinal) return 'High'
  if (daysToRenewal <= 90 && ['Outreach', 'Pending'].includes(stage)) return 'High'
  if (daysToRenewal <= 140 && ['Outreach', 'Pending'].includes(stage) && arr >= 100000) return 'High'
  if (overdueDays >= 14) return 'High'

  // Medium
  if (daysToRenewal >= 31 && daysToRenewal <= 60) return 'Medium'
  if (overdueDays >= 3 && overdueDays <= 13) return 'Medium'

  return 'Monitor'
}

export async function GET(request: NextRequest) {
  try {
    const rep = request.nextUrl.searchParams.get('rep') ?? 'all'
    const today = new Date().toISOString().slice(0, 10)

    let ownerFilter: string
    if (rep === 'all') {
      ownerFilter = `Owner.Name IN ('${TEAM_MEMBERS.join("','")}')`
    } else {
      const safeName = rep.replace(/'/g, "\\'")
      ownerFilter = `Owner.Name = '${safeName}'`
    }

    const soql = `SELECT Id, Name, Account.Name, StageName, CloseDate, Renewal_Date__c,
      ARR__c, Amount, Next_Follow_Up_Date__c, Owner.Name, Product__c,
      Probable_Outcome__c, Description, NextStep, LastActivityDate,
      Health_Score__c, AI_Churn_Risk_Category__c
    FROM Opportunity
    WHERE ${ownerFilter}
      AND IsClosed = false
      AND Type = 'Renewal'
      AND Renewal_Date__c != null
    ORDER BY Next_Follow_Up_Date__c ASC NULLS LAST
    LIMIT 200`

    const rows = await querySalesforce<SfTriageOpp>(soql)

    const opps: TriageOpp[] = rows.map(r => {
      const renewalDate = r.Renewal_Date__c ?? r.CloseDate ?? today
      const nextFollowUp = r.Next_Follow_Up_Date__c ?? today
      const daysToRenewal = daysBetween(today, renewalDate)
      const overdueDays = Math.max(0, daysBetween(nextFollowUp, today))
      const arr = r.ARR__c ?? r.Amount ?? 0
      const stage = r.StageName ?? ''

      let followUpStatus: TriageOpp['followUpStatus'] = 'upcoming'
      if (nextFollowUp === today) followUpStatus = 'due_today'
      else if (nextFollowUp < today) followUpStatus = 'overdue'

      return {
        id: r.Id,
        name: r.Name ?? r.Id,
        account: r.Account?.Name ?? 'Unknown',
        stage,
        renewalDate,
        closeDate: r.CloseDate ?? '',
        arr,
        nextFollowUp,
        owner: r.Owner?.Name ?? 'Unassigned',
        product: r.Product__c ?? '',
        probableOutcome: r.Probable_Outcome__c ?? 'Undetermined',
        description: r.Description,
        nextStep: r.NextStep,
        lastActivityDate: r.LastActivityDate,
        healthScore: r.Health_Score__c,
        churnRisk: r.AI_Churn_Risk_Category__c,
        daysToRenewal,
        followUpStatus,
        followUpOverdueDays: overdueDays,
        priorityTier: computePriority(daysToRenewal, stage, overdueDays, arr),
      }
    })

    // Sort by priority tier then days to renewal
    const tierOrder = { Critical: 0, High: 1, Medium: 2, Monitor: 3 }
    opps.sort((a, b) => {
      const t = tierOrder[a.priorityTier] - tierOrder[b.priorityTier]
      if (t !== 0) return t
      return a.daysToRenewal - b.daysToRenewal
    })

    const summary = {
      total: opps.length,
      overdue: opps.filter(o => o.followUpStatus === 'overdue').length,
      dueToday: opps.filter(o => o.followUpStatus === 'due_today').length,
      totalArr: opps.reduce((s, o) => s + o.arr, 0),
      critical: opps.filter(o => o.priorityTier === 'Critical').length,
      high: opps.filter(o => o.priorityTier === 'High').length,
    }

    return NextResponse.json({ opps, summary, owners: TEAM_MEMBERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[/api/tasks/triage] Error:', message)
    return NextResponse.json({ error: message, opps: [], summary: null, owners: [] }, { status: 500 })
  }
}
