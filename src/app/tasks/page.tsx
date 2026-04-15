'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'

interface TriageOpp {
  id: string; name: string; account: string; stage: string
  renewalDate: string; closeDate: string; arr: number
  nextFollowUp: string; owner: string; product: string
  probableOutcome: string; description: string | null
  nextStep: string | null; lastActivityDate: string | null
  healthScore: number | null; churnRisk: string | null
  daysToRenewal: number; followUpStatus: string
  followUpOverdueDays: number; priorityTier: string
}

interface Action {
  action: string; priority: string; category: string
  source: string; sourceDetail: string
  dueDate: string | null; owner: string
  completed?: boolean
}

interface Summary {
  total: number; overdue: number; dueToday: number
  totalArr: number; critical: number; high: number
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Critical: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  High:     { bg: '#fff7ed', text: '#9a3412', border: '#fdba74' },
  Medium:   { bg: '#fefce8', text: '#854d0e', border: '#fde047' },
  Monitor:  { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
}

const CATEGORY_ICONS: Record<string, string> = {
  email_customer: '✉', prepare_call: '📞', send_deliverable: '📄',
  update_crm: '💾', internal: '🏢', watch: '👁',
}

function fmtARR(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ActionRow({ action, onToggle }: { action: Action; onToggle: () => void }) {
  const pColor = action.priority === 'critical' ? '#dc2626' : action.priority === 'high' ? '#d97706' : action.priority === 'medium' ? '#2563eb' : '#64748b'
  return (
    <tr style={{ opacity: action.completed ? 0.4 : 1 }}>
      <td style={{ width: 28, padding: '8px 6px' }}>
        <input type="checkbox" checked={!!action.completed} onChange={onToggle} style={{ cursor: 'pointer' }} />
      </td>
      <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-td)' }}>
        <span style={{ textDecoration: action.completed ? 'line-through' : 'none' }}>{action.action}</span>
      </td>
      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: pColor, textTransform: 'uppercase' }}>{action.priority}</span>
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-faint)' }}>
        {CATEGORY_ICONS[action.category] ?? '•'} {action.category.replace(/_/g, ' ')}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-meta)' }}>
        {action.source === 'explicit' ? '📋' : '📐'} {action.sourceDetail}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
        {action.dueDate ? formatDate(action.dueDate) : '—'}
      </td>
    </tr>
  )
}

function OppCard({ opp, expanded, onToggle }: { opp: TriageOpp; expanded: boolean; onToggle: () => void }) {
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const tier = TIER_COLORS[opp.priorityTier] ?? TIER_COLORS.Monitor

  useEffect(() => {
    if (!expanded || loaded) return
    setLoading(true)
    fetch('/api/tasks/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity: opp }),
    })
      .then(r => r.json())
      .then(data => { setActions(data.actions ?? []); setLoaded(true) })
      .catch(() => setActions([]))
      .finally(() => setLoading(false))
  }, [expanded, loaded, opp])

  function toggleAction(idx: number) {
    setActions(prev => prev.map((a, i) => i === idx ? { ...a, completed: !a.completed } : a))
  }

  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${tier.border}`, borderLeft: `4px solid ${tier.border}`, borderRadius: 8, marginBottom: 8, boxShadow: 'var(--shadow)' }}>
      <div onClick={onToggle} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <svg style={{ width: 16, height: 16, color: 'var(--text-meta)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{opp.account}</span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{opp.name.length > 50 ? opp.name.slice(0, 50) + '…' : opp.name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: tier.bg, color: tier.text, textTransform: 'uppercase', letterSpacing: '.03em' }}>{opp.priorityTier}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {fmtARR(opp.arr)} · {opp.daysToRenewal}d · {opp.stage}
        </span>
        {opp.followUpStatus === 'overdue' && (
          <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: 4 }}>
            {opp.followUpOverdueDays}d overdue
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: `1px solid var(--border)` }}>
          {/* Quick info row */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>Renewal: <strong style={{ color: 'var(--text-td)' }}>{formatDate(opp.renewalDate)}</strong></span>
            <span>Follow-up: <strong style={{ color: 'var(--text-td)' }}>{formatDate(opp.nextFollowUp)}</strong></span>
            <span>Owner: <strong style={{ color: 'var(--text-td)' }}>{opp.owner}</strong></span>
            <span>Product: <strong style={{ color: 'var(--text-td)' }}>{opp.product || '—'}</strong></span>
            <Link href={`/opportunity/${opp.id}`} style={{ color: 'var(--link)', fontSize: 11 }}>Open detail →</Link>
          </div>

          {opp.nextStep && (
            <div style={{ fontSize: 12, color: 'var(--text-td)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-faint)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Next Step: </span>
              {opp.nextStep}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0' }}>
              <div style={{ width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generating actions...</span>
            </div>
          ) : actions.length > 0 ? (
            <div style={{ borderRadius: 6, border: '1px solid var(--border)', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    <th style={{ width: 28, padding: '6px' }} />
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Action</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Priority</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Category</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Source</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a, i) => <ActionRow key={i} action={a} onToggle={() => toggleAction(i)} />)}
                </tbody>
              </table>
            </div>
          ) : loaded ? (
            <p style={{ fontSize: 12, color: 'var(--text-meta)', padding: '12px 0' }}>No actions generated for this opportunity.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function TasksPage() {
  const [rep, setRep] = useState('all')
  const [owners, setOwners] = useState<string[]>([])
  const [opps, setOpps] = useState<TriageOpp[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/triage?rep=${encodeURIComponent(rep)}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setOpps(data.opps ?? [])
      setSummary(data.summary ?? null)
      if (data.owners) setOwners(data.owners)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [rep])

  useEffect(() => { load() }, [load])

  const todaysFocus = useMemo(() => {
    return opps
      .filter(o => o.priorityTier === 'Critical' || o.priorityTier === 'High')
      .slice(0, 5)
  }, [opps])

  return (
    <div>
      <header className="page-header">
        <Link href="/pipeline" className="brand" style={{ textDecoration: 'none' }}>ISR Dashboard</Link>
        <span className="header-meta" />
        <div className="view-toggle">
          <Link href="/pipeline" className="view-toggle-btn" style={{ textDecoration: 'none' }}>Pipeline</Link>
          <Link href="/pipeline" className="view-toggle-btn" style={{ textDecoration: 'none' }}>Accountability</Link>
          <Link href="/pipeline" className="view-toggle-btn" style={{ textDecoration: 'none' }}>Signals</Link>
          <span className="view-toggle-btn active">Tasks</span>
          <Link href="/settings" className="view-toggle-btn" style={{ textDecoration: 'none' }}>Settings</Link>
        </div>
      </header>

      <div style={{ padding: '16px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Rep selector + refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>Rep Tasks</h2>
          <select
            className="pl-filter"
            value={rep}
            onChange={e => setRep(e.target.value)}
          >
            <option value="all">All Reps</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <button className="refresh-btn" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, marginBottom: 16, color: '#991b1b', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Summary bar */}
        {summary && (
          <div className="pl-kpi-row" style={{ marginBottom: 16 }}>
            <div className="pl-kpi pl-kpi-blue">
              <div className="pl-kpi-label">Total Opps</div>
              <div className="pl-kpi-value">{summary.total}</div>
              <div className="pl-kpi-sub">{fmtARR(summary.totalArr)} pipeline</div>
            </div>
            <div className="pl-kpi pl-kpi-red">
              <div className="pl-kpi-label">Critical</div>
              <div className="pl-kpi-value">{summary.critical}</div>
              <div className="pl-kpi-sub">Act immediately</div>
            </div>
            <div className="pl-kpi pl-kpi-warn">
              <div className="pl-kpi-label">Overdue</div>
              <div className="pl-kpi-value">{summary.overdue}</div>
              <div className="pl-kpi-sub">Follow-up overdue</div>
            </div>
            <div className="pl-kpi pl-kpi-green">
              <div className="pl-kpi-label">Due Today</div>
              <div className="pl-kpi-value">{summary.dueToday}</div>
              <div className="pl-kpi-sub">Follow-up today</div>
            </div>
          </div>
        )}

        {/* Today's Focus */}
        {todaysFocus.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 16, boxShadow: 'var(--shadow)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 10 }}>
              Today&apos;s Focus
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todaysFocus.map(o => {
                const tier = TIER_COLORS[o.priorityTier] ?? TIER_COLORS.Monitor
                return (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: tier.bg, color: tier.text, textTransform: 'uppercase', minWidth: 52, textAlign: 'center' }}>{o.priorityTier}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{o.account}</span>
                    <span style={{ color: 'var(--text-faint)' }}>{fmtARR(o.arr)} · {o.daysToRenewal}d to renewal · {o.stage}</span>
                    {o.followUpOverdueDays > 0 && <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 600 }}>{o.followUpOverdueDays}d overdue</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--text-muted)' }}>Loading triage list from Salesforce...</span>
          </div>
        )}

        {/* Opp cards */}
        {!loading && opps.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-meta)', fontSize: 13 }}>
            No opportunities needing attention for {rep === 'all' ? 'the team' : rep}.
          </div>
        )}

        {!loading && opps.map(o => (
          <OppCard
            key={o.id}
            opp={o}
            expanded={expandedId === o.id}
            onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
          />
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
