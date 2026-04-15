'use client'

/**
 * Signal views — three React view components rendered inside the /pipeline
 * Dashboard, driven by the same live `Opportunity[]` that powers the gate
 * tables. These replace the static /demo/*.html prototypes.
 *
 *   PipelineReportView   — ARR-weighted health, tier distribution, at-risk ARR
 *   OppHealthView        — per-opp health signal matrix (scored columns)
 *   WorkflowSignalsView  — boolean trigger matrix (12 columns per opp)
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { Opportunity } from '@/lib/types'

// ── shared helpers ───────────────────────────────────────────────────────────

function fmtARR(v: number | null | undefined) {
  if (v == null) return '—'
  const n = Math.abs(v)
  if (n >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysBetween(later: string | null | undefined, earlier: Date) {
  if (!later) return null
  return Math.round((new Date(later).getTime() - earlier.getTime()) / 86_400_000)
}

function daysSince(dateStr: string | null | undefined, now: Date) {
  if (!dateStr) return null
  return Math.round((now.getTime() - new Date(dateStr).getTime()) / 86_400_000)
}

/** 0-100 health score from available opp fields. Uses `health_score` when
 * present; otherwise derives from gate flags + renewal proximity. */
function healthScore(opp: Opportunity, now: Date): number {
  if (opp.health_score != null) return Math.max(0, Math.min(100, opp.health_score))

  let score = 80
  if (opp.in_gate1)        score -= 25
  if (opp.in_gate2)        score -= 15
  if (opp.in_gate3)        score -= 10
  if (opp.in_gate4)        score -= 30
  if (opp.in_past_due)     score -= 20
  if (opp.in_not_touched)  score -= 10
  const risk = (opp.churn_risk ?? '').toLowerCase()
  if (risk === 'high')   score -= 20
  if (risk === 'medium') score -= 10
  const dtr = daysBetween(opp.renewal_date, now)
  if (dtr != null && dtr < 0)  score -= 15
  if (dtr != null && dtr <= 14) score -= 5
  return Math.max(0, Math.min(100, score))
}

type Tier = 'excellent' | 'good' | 'moderate' | 'poor' | 'critical'
const TIER_META: Record<Tier, { label: string; color: string; min: number }> = {
  excellent: { label: 'Excellent', color: '#16a34a', min: 90 },
  good:      { label: 'Good',      color: '#65a30d', min: 70 },
  moderate:  { label: 'Moderate',  color: '#d97706', min: 50 },
  poor:      { label: 'Poor',      color: '#ea580c', min: 30 },
  critical:  { label: 'Critical',  color: '#dc2626', min: 0  },
}
const TIER_ORDER: Tier[] = ['excellent', 'good', 'moderate', 'poor', 'critical']

function tierFor(score: number): Tier {
  if (score >= 90) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'moderate'
  if (score >= 30) return 'poor'
  return 'critical'
}

function oppLink(id: string, name: string | null) {
  return <Link href={`/opportunity/${id}`}>{name ?? id}</Link>
}

// cell color helpers (shared across Opp Health view)
function colorDtr(d: number | null): string | undefined {
  if (d == null) return undefined
  if (d < 0)   return '#dc2626'
  if (d <= 29) return '#dc2626'
  if (d <= 60) return '#d97706'
  return '#16a34a'
}
function colorGap(d: number | null): string | undefined {
  if (d == null) return undefined
  if (d <= 13) return '#16a34a'
  if (d <= 29) return '#d97706'
  return '#dc2626'
}
function colorFollowUp(d: number | null): string | undefined {
  // d = days the follow-up is overdue (positive means overdue)
  if (d == null || d <= 0) return '#16a34a'
  if (d <= 5)  return '#16a34a'
  if (d <= 9)  return '#d97706'
  return '#dc2626'
}
function colorScore(s: number): string {
  if (s >= 70) return '#2563eb'
  if (s >= 50) return '#d97706'
  return '#ea580c'
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Report view
// ═══════════════════════════════════════════════════════════════════════════

export function PipelineReportView({ opportunities }: { opportunities: Opportunity[] }) {
  const now = useMemo(() => new Date(), [])

  const data = useMemo(() => {
    const rows = opportunities.map(o => ({
      opp: o,
      score: healthScore(o, now),
      arr: o.arr ?? 0,
    }))
    const totalArr = rows.reduce((s, r) => s + r.arr, 0)
    const weighted = totalArr > 0
      ? rows.reduce((s, r) => s + r.score * r.arr, 0) / totalArr
      : 0
    const avgScore = rows.length > 0
      ? rows.reduce((s, r) => s + r.score, 0) / rows.length
      : 0

    const byTier: Record<Tier, { count: number; arr: number }> = {
      excellent: { count: 0, arr: 0 }, good: { count: 0, arr: 0 },
      moderate:  { count: 0, arr: 0 }, poor: { count: 0, arr: 0 },
      critical:  { count: 0, arr: 0 },
    }
    for (const r of rows) {
      const t = tierFor(r.score)
      byTier[t].count += 1
      byTier[t].arr   += r.arr
    }
    const atRiskArr  = byTier.poor.arr + byTier.critical.arr
    const atRiskPct  = totalArr > 0 ? (atRiskArr / totalArr) * 100 : 0
    return { rows, totalArr, weighted, avgScore, byTier, atRiskArr, atRiskPct }
  }, [opportunities, now])

  const atRiskColor =
    data.atRiskPct < 5  ? '#16a34a' :
    data.atRiskPct < 15 ? '#d97706' : '#dc2626'

  return (
    <div style={{ padding: '14px 20px' }}>
      {/* KPI row */}
      <div className="pl-kpi-row">
        <div className="pl-kpi pl-kpi-blue">
          <div className="pl-kpi-label">Opportunities</div>
          <div className="pl-kpi-value">{opportunities.length}</div>
          <div className="pl-kpi-sub">Tracked renewals</div>
        </div>
        <div className="pl-kpi pl-kpi-green">
          <div className="pl-kpi-label">Total ARR</div>
          <div className="pl-kpi-value">{fmtARR(data.totalArr)}</div>
          <div className="pl-kpi-sub">Across all opps</div>
        </div>
        <div className="pl-kpi pl-kpi-warn">
          <div className="pl-kpi-label">ARR-Weighted Health</div>
          <div className="pl-kpi-value">{data.weighted.toFixed(1)}</div>
          <div className="pl-kpi-sub">Avg score {data.avgScore.toFixed(1)}</div>
        </div>
        <div className="pl-kpi pl-kpi-red">
          <div className="pl-kpi-label">At-Risk ARR</div>
          <div className="pl-kpi-value" style={{ color: atRiskColor }}>
            {fmtARR(data.atRiskArr)}
          </div>
          <div className="pl-kpi-sub">{data.atRiskPct.toFixed(1)}% of pipeline (poor + critical)</div>
        </div>
      </div>

      {/* Tier distribution */}
      <div className="pl-chart-box">
        <div className="pl-chart-title">Health Tier Distribution</div>
        <TierStackBar byTier={data.byTier} totalArr={data.totalArr} />
        <table style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Score Range</th>
              <th style={{ textAlign: 'right' }}>Opps</th>
              <th style={{ textAlign: 'right' }}>% of Pipeline</th>
              <th style={{ textAlign: 'right' }}>ARR</th>
              <th style={{ textAlign: 'right' }}>ARR %</th>
            </tr>
          </thead>
          <tbody>
            {TIER_ORDER.map(t => {
              const bucket = data.byTier[t]
              const meta   = TIER_META[t]
              const oppPct = opportunities.length > 0 ? (bucket.count / opportunities.length) * 100 : 0
              const arrPct = data.totalArr > 0 ? (bucket.arr / data.totalArr) * 100 : 0
              const range  =
                t === 'excellent' ? '90–100' :
                t === 'good'      ? '70–89'  :
                t === 'moderate'  ? '50–69'  :
                t === 'poor'      ? '30–49'  : '0–29'
              return (
                <tr key={t}>
                  <td><span className="badge" style={{ background: meta.color }}>{meta.label}</span></td>
                  <td>{range}</td>
                  <td style={{ textAlign: 'right' }}>{bucket.count}</td>
                  <td style={{ textAlign: 'right' }}>{oppPct.toFixed(1)}%</td>
                  <td style={{ textAlign: 'right' }}>{fmtARR(bucket.arr)}</td>
                  <td style={{ textAlign: 'right' }}>{arrPct.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Critical / Poor drilldown */}
      <div className="pl-chart-box">
        <div className="pl-chart-title">At-Risk Opportunities (Poor + Critical)</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Opportunity</th><th>Owner</th><th>Account</th>
                <th>Stage</th><th>Score</th><th>Renewal</th><th>ARR</th>
              </tr>
            </thead>
            <tbody>
              {data.rows
                .filter(r => r.score < 50)
                .sort((a, b) => b.arr - a.arr)
                .slice(0, 50)
                .map(r => (
                  <tr key={r.opp.id}>
                    <td>{oppLink(r.opp.id, r.opp.name)}</td>
                    <td>{r.opp.owner_name ?? '—'}</td>
                    <td>{r.opp.account ?? '—'}</td>
                    <td>{r.opp.stage ?? '—'}</td>
                    <td>
                      <span className="badge" style={{ background: TIER_META[tierFor(r.score)].color }}>
                        {r.score.toFixed(0)}
                      </span>
                    </td>
                    <td>{fmtDate(r.opp.renewal_date)}</td>
                    <td>{fmtARR(r.arr)}</td>
                  </tr>
                ))}
              {data.rows.filter(r => r.score < 50).length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-meta)', padding: '18px 0' }}>No at-risk opportunities</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function TierStackBar({ byTier, totalArr }: { byTier: Record<Tier, { count: number; arr: number }>; totalArr: number }) {
  if (totalArr <= 0) return <div style={{ color: 'var(--text-meta)', fontSize: 12 }}>No ARR data</div>

  return (
    <div>
      <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {TIER_ORDER.map(t => {
          const pct = (byTier[t].arr / totalArr) * 100
          if (pct <= 0) return null
          return (
            <div key={t}
              title={`${TIER_META[t].label}: ${pct.toFixed(1)}% ARR`}
              style={{ width: `${pct}%`, background: TIER_META[t].color }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        {TIER_ORDER.map(t => (
          <div key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, background: TIER_META[t].color, borderRadius: 2 }} />
            {TIER_META[t].label} · {byTier[t].count}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Opp Health view
// ═══════════════════════════════════════════════════════════════════════════

export function OppHealthView({ opportunities }: { opportunities: Opportunity[] }) {
  const now = useMemo(() => new Date(), [])
  const [tierFilter,  setTierFilter]  = useState<Tier | ''>('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => opportunities.map(o => {
    const score = healthScore(o, now)
    const dtr   = daysBetween(o.renewal_date, now)
    const gap   = daysSince(o.last_activity_date, now)
    const followUpOverdue = o.next_follow_up_date
      ? Math.max(0, -(daysBetween(o.next_follow_up_date, now) ?? 0))
      : null
    return {
      opp: o,
      score,
      tier: tierFor(score),
      dtr,
      gap,
      followUpOverdue,
    }
  }), [opportunities, now])

  const owners = useMemo(() =>
    Array.from(new Set(opportunities.map(o => o.owner_name).filter(Boolean) as string[])).sort(),
  [opportunities])

  const filtered = useMemo(() => rows.filter(r => {
    if (tierFilter  && r.tier !== tierFilter) return false
    if (ownerFilter && r.opp.owner_name !== ownerFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (r.opp.name ?? '').toLowerCase().includes(s) ||
             (r.opp.account ?? '').toLowerCase().includes(s) ||
             (r.opp.owner_name ?? '').toLowerCase().includes(s)
    }
    return true
  }), [rows, tierFilter, ownerFilter, search])

  const tierCounts = useMemo(() => {
    const c: Record<Tier, number> = { excellent: 0, good: 0, moderate: 0, poor: 0, critical: 0 }
    for (const r of rows) c[r.tier] += 1
    return c
  }, [rows])

  return (
    <div style={{ padding: '14px 20px' }}>
      {/* Tier KPI row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {TIER_ORDER.map(t => {
          const active = tierFilter === t
          return (
            <button
              key={t}
              onClick={() => setTierFilter(active ? '' : t)}
              style={{
                background: active ? TIER_META[t].color : 'var(--surface)',
                color: active ? '#fff' : 'var(--text-td)',
                border: `1px solid ${active ? TIER_META[t].color : 'var(--border)'}`,
                borderLeft: `4px solid ${TIER_META[t].color}`,
                borderRadius: 6,
                padding: '8px 14px',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
                minWidth: 120,
              }}
            >
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', opacity: .85 }}>
                {TIER_META[t].label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{tierCounts[t]}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          placeholder="Search name / account / owner…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-filter"
          style={{ minWidth: 240 }}
        />
        <select className="pl-filter" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
          <option value="">All owners</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {(tierFilter || ownerFilter || search) && (
          <button className="back-btn" onClick={() => { setTierFilter(''); setOwnerFilter(''); setSearch('') }}>
            Reset
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-meta)' }}>
          {filtered.length} of {rows.length} opportunities
        </span>
      </div>

      {/* Signal table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Opportunity</th>
              <th>Owner</th>
              <th>Stage</th>
              <th style={{ textAlign: 'right' }}>Score</th>
              <th style={{ textAlign: 'right' }}>ARR</th>
              <th>Renewal</th>
              <th style={{ textAlign: 'right' }}>DTR</th>
              <th style={{ textAlign: 'right' }}>Activity Gap</th>
              <th style={{ textAlign: 'right' }}>Follow-up Overdue</th>
              <th>Churn Risk</th>
              <th>HVO</th>
              <th>AR</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .sort((a, b) => a.score - b.score)
              .slice(0, 300)
              .map(r => {
                const risk = (r.opp.churn_risk ?? '').toLowerCase()
                const riskColor =
                  risk === 'high'   ? '#dc2626' :
                  risk === 'medium' ? '#d97706' :
                  risk === 'low'    ? '#16a34a' : 'var(--text-meta)'
                return (
                  <tr key={r.opp.id}>
                    <td>{oppLink(r.opp.id, r.opp.name)}</td>
                    <td>{r.opp.owner_name ?? '—'}</td>
                    <td>{r.opp.stage ?? '—'}</td>
                    <td style={{ textAlign: 'right', color: colorScore(r.score), fontWeight: 600 }}>
                      {r.score.toFixed(0)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtARR(r.opp.arr)}</td>
                    <td>{fmtDate(r.opp.renewal_date)}</td>
                    <td style={{ textAlign: 'right', color: colorDtr(r.dtr), fontWeight: 600 }}>
                      {r.dtr == null ? '—' : r.dtr < 0 ? `${r.dtr}d` : `${r.dtr}d`}
                    </td>
                    <td style={{ textAlign: 'right', color: colorGap(r.gap), fontWeight: 600 }}>
                      {r.gap == null ? '—' : `${r.gap}d`}
                    </td>
                    <td style={{ textAlign: 'right', color: colorFollowUp(r.followUpOverdue), fontWeight: 600 }}>
                      {r.followUpOverdue == null ? '—' : r.followUpOverdue === 0 ? 'On time' : `${r.followUpOverdue}d`}
                    </td>
                    <td style={{ color: riskColor, fontWeight: 600 }}>{r.opp.churn_risk ?? '—'}</td>
                    <td>{r.opp.high_value ? <span className="badge" style={{ background: '#7c3aed' }}>HVO</span> : '—'}</td>
                    <td>{r.opp.auto_renewal_clause ? <span className="badge" style={{ background: '#0891b2' }}>AR</span> : '—'}</td>
                  </tr>
                )
              })}
            {filtered.length === 0 && (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-meta)', padding: '24px 0' }}>No opportunities match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Workflow Signals view — boolean trigger matrix
// ═══════════════════════════════════════════════════════════════════════════

interface Signals {
  gap14:       boolean
  gap30:       boolean
  followUp:    boolean
  churnHigh:   boolean
  churnMedium: boolean
  imminent:    boolean  // DTR <= 30
  window:      boolean  // DTR 30..60
  hvoRisk:     boolean
  silentChurn: boolean
  gate1:       boolean
  gate2:       boolean
  pastDue:     boolean
}

const SIGNAL_COLS: { key: keyof Signals; label: string; color: string }[] = [
  { key: 'imminent',    label: 'Renewal ≤30d',   color: '#dc2626' },
  { key: 'window',      label: 'Window 30–60d',  color: '#d97706' },
  { key: 'pastDue',     label: 'Past Due',       color: '#dc2626' },
  { key: 'gate1',       label: 'Gate 1',         color: '#ef4444' },
  { key: 'gate2',       label: 'Gate 2',         color: '#f97316' },
  { key: 'gap14',       label: 'Gap >14d',       color: '#d97706' },
  { key: 'gap30',       label: 'Gap >30d',       color: '#dc2626' },
  { key: 'followUp',    label: 'Follow-up Late', color: '#d97706' },
  { key: 'churnHigh',   label: 'Churn High',     color: '#dc2626' },
  { key: 'churnMedium', label: 'Churn Med',      color: '#d97706' },
  { key: 'hvoRisk',     label: 'HVO at Risk',    color: '#7c3aed' },
  { key: 'silentChurn', label: 'Silent Churn',   color: '#be123c' },
]

function computeSignals(o: Opportunity, now: Date): Signals {
  const dtr  = daysBetween(o.renewal_date, now) ?? 9999
  const gap  = daysSince(o.last_activity_date, now) ?? 9999
  const fu   = o.next_follow_up_date ? daysBetween(o.next_follow_up_date, now) ?? 0 : 0
  const risk = (o.churn_risk ?? '').toLowerCase()
  const gap14 = gap > 14
  const gap30 = gap > 30
  const churnHigh   = risk === 'high'
  const churnMedium = risk === 'medium'
  const imminent    = dtr >= 0 && dtr <= 30
  const pastDue     = !!o.in_past_due || dtr < 0
  const hvoRisk     = !!o.high_value && (o.in_gate1 || o.in_gate3 || o.in_gate4 || pastDue)
  const silentChurn = churnHigh && !!o.in_not_touched
  return {
    gap14, gap30,
    followUp: fu < 0,
    churnHigh, churnMedium,
    imminent,
    window: dtr > 30 && dtr <= 60,
    hvoRisk,
    silentChurn,
    gate1: !!o.in_gate1,
    gate2: !!o.in_gate2,
    pastDue,
  }
}

function signalCount(s: Signals): number {
  return Object.values(s).filter(Boolean).length
}

export function WorkflowSignalsView({ opportunities }: { opportunities: Opportunity[] }) {
  const now = useMemo(() => new Date(), [])
  const [minSignals, setMinSignals] = useState(1)
  const [ownerFilter, setOwnerFilter] = useState('')
  const [search, setSearch] = useState('')
  const [focusKey, setFocusKey] = useState<keyof Signals | ''>('')

  const rows = useMemo(() =>
    opportunities.map(o => {
      const sig   = computeSignals(o, now)
      const count = signalCount(sig)
      return { opp: o, sig, count }
    }),
  [opportunities, now])

  const totals = useMemo(() => {
    const t: Record<keyof Signals, number> = {
      gap14: 0, gap30: 0, followUp: 0, churnHigh: 0, churnMedium: 0,
      imminent: 0, window: 0, hvoRisk: 0, silentChurn: 0,
      gate1: 0, gate2: 0, pastDue: 0,
    }
    for (const r of rows) {
      for (const k of Object.keys(t) as (keyof Signals)[]) {
        if (r.sig[k]) t[k] += 1
      }
    }
    return t
  }, [rows])

  const owners = useMemo(() =>
    Array.from(new Set(opportunities.map(o => o.owner_name).filter(Boolean) as string[])).sort(),
  [opportunities])

  const filtered = useMemo(() => rows.filter(r => {
    if (r.count < minSignals) return false
    if (focusKey && !r.sig[focusKey]) return false
    if (ownerFilter && r.opp.owner_name !== ownerFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (r.opp.name ?? '').toLowerCase().includes(s) ||
             (r.opp.account ?? '').toLowerCase().includes(s) ||
             (r.opp.owner_name ?? '').toLowerCase().includes(s)
    }
    return true
  }), [rows, minSignals, focusKey, ownerFilter, search])

  return (
    <div style={{ padding: '14px 20px' }}>
      {/* Signal pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {SIGNAL_COLS.map(col => {
          const active = focusKey === col.key
          return (
            <button
              key={col.key}
              onClick={() => setFocusKey(active ? '' : col.key)}
              style={{
                background: active ? col.color : 'var(--surface)',
                color: active ? '#fff' : 'var(--text-td)',
                border: `1px solid ${active ? col.color : 'var(--border)'}`,
                borderLeft: `4px solid ${col.color}`,
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontWeight: 600 }}>{col.label}</span>
              <span style={{ marginLeft: 6, fontSize: 10, opacity: .8 }}>{totals[col.key]}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          placeholder="Search name / account / owner…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-filter"
          style={{ minWidth: 240 }}
        />
        <select className="pl-filter" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
          <option value="">All owners</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Min signals
          <select
            className="pl-filter"
            value={minSignals}
            onChange={e => setMinSignals(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}+</option>)}
          </select>
        </label>
        {(focusKey || ownerFilter || search || minSignals !== 1) && (
          <button className="back-btn" onClick={() => { setFocusKey(''); setOwnerFilter(''); setSearch(''); setMinSignals(1) }}>
            Reset
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-meta)' }}>
          {filtered.length} of {rows.length} opportunities
        </span>
      </div>

      {/* Trigger matrix */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 2 }}>Opportunity</th>
              <th>Owner</th>
              <th style={{ textAlign: 'right' }}>ARR</th>
              <th style={{ textAlign: 'center' }}>Signals</th>
              {SIGNAL_COLS.map(c => (
                <th key={c.key} style={{ textAlign: 'center', color: c.color }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered
              .sort((a, b) => b.count - a.count || (b.opp.arr ?? 0) - (a.opp.arr ?? 0))
              .slice(0, 300)
              .map(r => (
                <tr key={r.opp.id}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>
                    {oppLink(r.opp.id, r.opp.name)}
                  </td>
                  <td>{r.opp.owner_name ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{fmtARR(r.opp.arr)}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: r.count >= 4 ? '#dc2626' : r.count >= 2 ? '#d97706' : 'var(--text-td)' }}>
                    {r.count}
                  </td>
                  {SIGNAL_COLS.map(c => (
                    <td key={c.key} style={{ textAlign: 'center' }}>
                      {r.sig[c.key]
                        ? <span style={{
                            display: 'inline-block',
                            width: 12, height: 12,
                            borderRadius: '50%',
                            background: c.color,
                          }} />
                        : <span style={{ color: 'var(--text-meta)' }}>·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4 + SIGNAL_COLS.length} style={{ textAlign: 'center', color: 'var(--text-meta)', padding: '24px 0' }}>
                No opportunities match your filters
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
