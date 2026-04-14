'use client'

import { useState, useEffect, useMemo } from 'react'
import { QueueStatus } from '@/types/renewals'
import type { QueueItem, FilterOptions } from '@/types/renewals'
import { getStatusConfig, cn } from '@/lib/utils'
import OpportunityCard from './OpportunityCard'

const STATUS_ORDER: QueueStatus[] = [
  QueueStatus.OverdueFollowUp,
  QueueStatus.NeedsFollowUpThisWeek,
  QueueStatus.NeedsRepReview,
  QueueStatus.RecentlyContacted,
  QueueStatus.WaitingOnCustomer,
  QueueStatus.WaitingOnInternalAction,
  QueueStatus.NoActionNeeded,
]

function fmtARR(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

export default function WorkflowQueue() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<QueueStatus | ''>('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/opportunities')
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'Failed to load')
          return
        }
        setItems(data.items ?? [])
        setFilterOptions(data.filterOptions ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Status counts for KPI pills
  const statusCounts = useMemo(() => {
    const counts: Record<string, { count: number; arr: number }> = {}
    for (const s of STATUS_ORDER) {
      counts[s] = { count: 0, arr: 0 }
    }
    for (const item of items) {
      const s = item.opportunity.queueStatus
      if (counts[s]) {
        counts[s].count++
        counts[s].arr += item.opportunity.arr ?? 0
      }
    }
    return counts
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(item => {
      const opp = item.opportunity
      if (statusFilter && opp.queueStatus !== statusFilter) return false
      if (ownerFilter && opp.owner !== ownerFilter) return false
      if (search) {
        const s = search.toLowerCase()
        if (
          !opp.accountName.toLowerCase().includes(s) &&
          !opp.opportunityName.toLowerCase().includes(s) &&
          !opp.owner.toLowerCase().includes(s)
        ) return false
      }
      return true
    })
  }, [items, statusFilter, ownerFilter, search])

  // Sort: overdue first, then by days since call descending
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.opportunity.queueStatus)
      const bi = STATUS_ORDER.indexOf(b.opportunity.queueStatus)
      if (ai !== bi) return ai - bi
      return b.opportunity.daysSinceLastRenewalCall - a.opportunity.daysSinceLastRenewalCall
    })
  }, [filtered])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        <span style={{ marginLeft: 10, fontSize: 13, color: '#6b7280' }}>Loading workflow signals...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#dc2626', fontSize: 14 }}>Error: {error}</p>
      </div>
    )
  }

  const anyFilter = statusFilter || ownerFilter || search

  return (
    <div style={{ padding: '14px 20px' }}>
      {/* Status KPI pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {STATUS_ORDER.filter(s => statusCounts[s].count > 0).map(s => {
          const cfg = getStatusConfig(s)
          const { count, arr } = statusCounts[s]
          const active = statusFilter === s
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(active ? '' : s)}
              className={cn(
                'rounded-lg px-3 py-2 text-left border transition-all',
                active ? 'ring-2 ring-blue-500 border-blue-300' : 'border-gray-200 hover:border-gray-300'
              )}
              style={{ minWidth: 130, background: active ? '#eff6ff' : 'white' }}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={cn('h-2 w-2 rounded-full', cfg.dotColor)} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{cfg.label}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{count}</div>
              {arr > 0 && (
                <div style={{ fontSize: 11, color: '#6b7280' }}>{fmtARR(arr)} ARR</div>
              )}
            </button>
          )
        })}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          placeholder="Search account, opportunity, owner..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-filter"
          style={{ minWidth: 260 }}
        />
        <select
          className="pl-filter"
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
        >
          <option value="">All Owners</option>
          {(filterOptions?.owners ?? []).map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {anyFilter && (
          <button
            className="back-btn"
            onClick={() => { setStatusFilter(''); setOwnerFilter(''); setSearch('') }}
          >
            Reset
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>
          {sorted.length} of {items.length} opportunities
        </span>
      </div>

      {/* Opportunity cards */}
      <div className="space-y-3">
        {sorted.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 14 }}>
            No opportunities match your filters
          </div>
        )}
        {sorted.map(item => (
          <OpportunityCard
            key={item.opportunity.id}
            item={item}
            isExpanded={expandedId === item.opportunity.id}
            onToggle={() => setExpandedId(
              expandedId === item.opportunity.id ? null : item.opportunity.id
            )}
          />
        ))}
      </div>
    </div>
  )
}
