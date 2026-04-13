// Reads opportunities from the base (isr-dash) Supabase schema and reshapes
// them into the QueueItem format the portal-derived frontend expects.
//
// Base schema columns (from supabase/schema.sql):
//   id (PK), name, owner_name, owner_email, account, stage, arr,
//   renewal_date, close_date, last_activity_date, next_follow_up_date,
//   next_step, description, churn_risk, health_score, product,
//   is_closed, in_gate1..4, in_not_touched, in_past_due, updated_at
//
// Portal-shaped fields that don't exist in the base schema (queue_status,
// flag_reason, activity_history, etc.) are derived from gate flags or
// defaulted.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { QueueStatus } from "@/types/renewals";
import type { FilterOptions, QueueItem } from "@/types/renewals";

export const dynamic = "force-dynamic";

const EMPTY_FILTER_OPTIONS: FilterOptions = {
  owners: [],
  stages: [],
  productFamilies: [],
  churnRiskCategories: [],
};

// ---------------------------------------------------------------------------
// Derivations — map isr-dash gate flags onto the QueueStatus enum the portal
// frontend was built against.
// ---------------------------------------------------------------------------

type OppRow = {
  id: string;
  name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  account: string | null;
  stage: string | null;
  arr: number | null;
  renewal_date: string | null;
  close_date: string | null;
  last_activity_date: string | null;
  next_follow_up_date: string | null;
  next_step: string | null;
  description: string | null;
  churn_risk: string | null;
  health_score: number | null;
  product: string | null;
  is_closed: boolean | null;
  in_gate1: boolean | null;
  in_gate2: boolean | null;
  in_gate3: boolean | null;
  in_gate4: boolean | null;
  in_not_touched: boolean | null;
  in_past_due: boolean | null;
  updated_at: string | null;
};

function deriveQueueStatus(row: OppRow): QueueStatus {
  if (row.is_closed) return QueueStatus.NoActionNeeded;
  if (row.in_gate4 || row.in_past_due || row.in_not_touched) return QueueStatus.OverdueFollowUp;
  if (row.in_gate3) return QueueStatus.NeedsFollowUpThisWeek;
  if (row.in_gate1 || row.in_gate2) return QueueStatus.NeedsRepReview;
  return QueueStatus.NeedsRepReview;
}

function deriveFlagReason(row: OppRow): string {
  if (row.is_closed) return "Closed";
  if (row.in_gate4) return "Gate 4: renewal date passed, opportunity still open";
  if (row.in_past_due) return "Past due — renewal date passed";
  if (row.in_not_touched) return "No activity logged in the last 7+ days (Gate 3)";
  if (row.in_gate3) return "Gate 3: within 30 days of renewal, not in Finalizing";
  if (row.in_gate2) return "Gate 2: within 90 days, no quote sent";
  if (row.in_gate1) return "Gate 1: within 140 days, no engagement";
  return "";
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  return Math.max(0, diff);
}

// ---------------------------------------------------------------------------
// GET /api/opportunities
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: rows, error } = await supabase
      .from("opportunities")
      .select("*")
      .eq("is_closed", false)
      .order("close_date", { ascending: true });

    if (error) {
      console.error("[/api/opportunities] Supabase query error:", error);
      return NextResponse.json(
        {
          error: `Supabase query failed: ${error.message} (code: ${error.code ?? "unknown"})`,
          items: [],
          filterOptions: EMPTY_FILTER_OPTIONS,
        },
        { status: 500 }
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ items: [], filterOptions: EMPTY_FILTER_OPTIONS });
    }

    const typedRows = rows as OppRow[];

    // Shape rows into the QueueItem format the frontend expects
    const items: QueueItem[] = typedRows.map((row) => {
      const lastContact = row.last_activity_date ?? "";
      const arrValue = row.arr ?? 0;
      return {
        opportunity: {
          id: row.id,
          accountName: row.account ?? "Unknown Account",
          opportunityName: row.name ?? row.id,
          owner: row.owner_name ?? "Unassigned",
          stage: row.stage ?? "",
          renewalDate: row.renewal_date ?? row.close_date ?? "",
          closeDate: row.close_date ?? "",
          arr: arrValue,
          amount: arrValue,
          queueStatus: deriveQueueStatus(row),
          daysSinceLastRenewalCall: daysSince(row.last_activity_date),
          flagReason: deriveFlagReason(row),
          lastContactDate: lastContact,
          nextStepOwner: row.next_step ?? row.owner_name ?? "Unassigned",
          renewalCallLogged: false, // no direct signal in base schema
          healthScore: row.health_score,
          churnRiskCategory: row.churn_risk,
          productFamily: row.product,
          hasOpenActivity: false,
          hasOverdueTask: false,
          description: row.description,
        },
        activityHistory: [], // fetched on-demand via /api/opportunity-activities
        aiSuggestions: {
          emailDraft: {
            subject: "AI draft pending",
            body: "Email draft will be generated when requested.",
          },
          callObjective: "Call objective will be generated when requested.",
        },
      };
    });

    // Extract filter options from the mapped data
    const owners = new Set<string>();
    const stages = new Set<string>();
    const productFamilies = new Set<string>();
    const churnRiskCategories = new Set<string>();

    for (const row of typedRows) {
      if (row.owner_name) owners.add(row.owner_name);
      if (row.stage) stages.add(row.stage);
      if (row.product) productFamilies.add(row.product);
      if (row.churn_risk) churnRiskCategories.add(row.churn_risk);
    }

    const sort = (s: Set<string>) =>
      Array.from(s).sort((a, b) => a.localeCompare(b));

    const filterOptions: FilterOptions = {
      owners: sort(owners),
      stages: sort(stages),
      productFamilies: sort(productFamilies),
      churnRiskCategories: sort(churnRiskCategories),
    };

    // Derive syncedAt from the most recent updated_at across rows
    const syncedAt = typedRows.reduce<string | null>((latest, row) => {
      if (!row.updated_at) return latest;
      if (!latest || row.updated_at > latest) return row.updated_at;
      return latest;
    }, null);

    return NextResponse.json({ items, filterOptions, syncedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[/api/opportunities] Error:", message);
    return NextResponse.json(
      { error: message, items: [], filterOptions: EMPTY_FILTER_OPTIONS },
      { status: 500 }
    );
  }
}
