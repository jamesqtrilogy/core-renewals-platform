'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface KnowledgeDoc {
  id: string
  name: string
  description: string
  content: string
  category: string
  priority: string
  is_active: boolean
}

interface PromptTemplate {
  id: string
  feature: string
  name: string
  system_prompt: string
  model: string
  temperature: number
  variables: string[]
  is_active: boolean
}

interface AISettings {
  [key: string]: unknown
  default_model_email: string
  default_model_summary: string
  default_model_call_objective: string
  default_model_question: string
  default_temperature: number
  reasoning_effort: string
  response_length: string
  tone_override: string
  include_description: boolean
  include_activity_history: boolean
  include_support_tickets: boolean
  max_activity_count: number
}

// ── Constants ────────────────────────────────────────────────────────────────

const KB_CATEGORIES = [
  { value: 'pricing_rules', label: 'Pricing Rules' },
  { value: 'objection_handling', label: 'Objection Handling' },
  { value: 'product_knowledge', label: 'Product Knowledge' },
  { value: 'process_cadence', label: 'Process & Cadence' },
  { value: 'selling_framework', label: 'Selling Framework' },
  { value: 'general', label: 'General' },
]

const KB_PRIORITIES = [
  { value: 'always_include', label: 'Always include' },
  { value: 'when_relevant', label: 'Include when relevant' },
]

const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'gpt-4o', label: 'GPT-4o' },
]

const FEATURES = [
  { value: 'email', label: 'Email Draft' },
  { value: 'summary', label: 'Deal Summary' },
  { value: 'call_objective', label: 'Call Objective' },
  { value: 'question', label: 'AI Chat' },
]

const PROMPT_VARS = [
  '{opportunity_name}', '{account_name}', '{owner}', '{stage}', '{arr}',
  '{renewal_date}', '{close_date}', '{last_contact_date}',
  '{days_since_renewal_call}', '{queue_status}', '{flag_reason}',
  '{health_score}', '{churn_risk}', '{description}', '{activity_history}',
]

const TONES = ['professional', 'friendly', 'urgent', 'firm']
const RESPONSE_LENGTHS = ['concise', 'detailed', 'comprehensive']

function categoryColor(c: string) {
  const colors: Record<string, string> = {
    pricing_rules: '#dc2626',
    objection_handling: '#d97706',
    product_knowledge: '#2563eb',
    process_cadence: '#7c3aed',
    selling_framework: '#0891b2',
    general: '#64748b',
  }
  return colors[c] ?? '#64748b'
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  })
  return res.json()
}

// ── Section selector ─────────────────────────────────────────────────────────

type Section = 'knowledge' | 'prompts' | 'behavior'

const SECTIONS: { id: Section; label: string; desc: string }[] = [
  { id: 'knowledge', label: 'Knowledge Base', desc: 'Documents the AI references' },
  { id: 'prompts', label: 'Prompt Templates', desc: 'System prompts per feature' },
  { id: 'behavior', label: 'AI Behavior', desc: 'Model, tone, context settings' },
]

// ── Knowledge Base Section ───────────────────────────────────────────────────

function KnowledgeBaseSection() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<KnowledgeDoc | null>(null)
  const [isNew, setIsNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await api<KnowledgeDoc[]>('/api/settings/ai-knowledge')
    setDocs(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function startNew() {
    setIsNew(true)
    setEditing({
      id: '', name: '', description: '', content: '',
      category: 'general', priority: 'when_relevant', is_active: true,
    })
  }

  async function save() {
    if (!editing) return
    await api('/api/settings/ai-knowledge', {
      method: isNew ? 'POST' : 'PUT',
      body: JSON.stringify(editing),
    })
    setEditing(null)
    setIsNew(false)
    load()
  }

  async function remove(id: string) {
    await api('/api/settings/ai-knowledge', { method: 'DELETE', body: JSON.stringify({ id }) })
    load()
  }

  async function toggle(doc: KnowledgeDoc) {
    await api('/api/settings/ai-knowledge', {
      method: 'PUT',
      body: JSON.stringify({ ...doc, is_active: !doc.is_active }),
    })
    load()
  }

  if (loading) return <div className="settings-loading">Loading knowledge base...</div>

  if (editing) {
    return (
      <div className="settings-form">
        <div className="settings-form-header">
          <h3>{isNew ? 'New Knowledge Document' : `Edit: ${editing.name}`}</h3>
          <button className="settings-btn-ghost" onClick={() => { setEditing(null); setIsNew(false) }}>Cancel</button>
        </div>

        <label className="settings-label">Document Name</label>
        <input
          className="settings-input"
          value={editing.name}
          onChange={e => setEditing({ ...editing, name: e.target.value })}
          placeholder="e.g. Renewals Playbook, Pricing Rules"
        />

        <label className="settings-label">Description <span style={{ color: 'var(--text-meta)', fontWeight: 400 }}>(when should the AI reference this?)</span></label>
        <input
          className="settings-input"
          value={editing.description}
          onChange={e => setEditing({ ...editing, description: e.target.value })}
          placeholder="e.g. Critical pricing rules — include on every generation"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="settings-label">Category</label>
            <select
              className="settings-select"
              value={editing.category}
              onChange={e => setEditing({ ...editing, category: e.target.value })}
            >
              {KB_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="settings-label">Priority</label>
            <select
              className="settings-select"
              value={editing.priority}
              onChange={e => setEditing({ ...editing, priority: e.target.value })}
            >
              {KB_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <label className="settings-label">Document Content</label>
        <textarea
          className="settings-textarea settings-mono"
          value={editing.content}
          onChange={e => setEditing({ ...editing, content: e.target.value })}
          placeholder="Paste or type the full document content here..."
          rows={16}
        />

        <div className="settings-form-actions">
          <button className="settings-btn-primary" onClick={save} disabled={!editing.name.trim() || !editing.content.trim()}>
            {isNew ? 'Add Document' : 'Save Changes'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="settings-section-header">
        <div>
          <h3>Knowledge Base</h3>
          <p>Documents the AI references when generating emails, summaries, and call objectives. &quot;Always include&quot; docs are sent on every generation; &quot;when relevant&quot; docs are included based on context.</p>
        </div>
        <button className="settings-btn-primary" onClick={startNew}>+ Add Document</button>
      </div>

      {docs.length === 0 ? (
        <div className="settings-empty">No knowledge base documents. Add one to give the AI context about your business rules and processes.</div>
      ) : (
        <div className="settings-card-list">
          {docs.map(doc => (
            <div key={doc.id} className={`settings-card ${!doc.is_active ? 'inactive' : ''}`}>
              <div className="settings-card-top">
                <div className="settings-card-title-row">
                  <span className="settings-card-name">{doc.name}</span>
                  <span className="settings-badge" style={{ background: categoryColor(doc.category) + '1a', color: categoryColor(doc.category), borderColor: categoryColor(doc.category) + '40' }}>
                    {KB_CATEGORIES.find(c => c.value === doc.category)?.label ?? doc.category}
                  </span>
                  <span className={`settings-badge ${doc.priority === 'always_include' ? '' : ''}`} style={{
                    background: doc.priority === 'always_include' ? '#16a34a1a' : 'var(--surface2)',
                    color: doc.priority === 'always_include' ? '#16a34a' : 'var(--text-faint)',
                    borderColor: doc.priority === 'always_include' ? '#16a34a40' : 'var(--border)',
                  }}>
                    {doc.priority === 'always_include' ? 'Always' : 'When relevant'}
                  </span>
                </div>
                <div className="settings-card-actions">
                  <button className="settings-toggle" onClick={() => toggle(doc)}>
                    <span className={`settings-toggle-track ${doc.is_active ? 'on' : ''}`}>
                      <span className="settings-toggle-thumb" />
                    </span>
                  </button>
                  <button className="settings-btn-ghost-sm" onClick={() => { setEditing(doc); setIsNew(false) }}>Edit</button>
                  <button className="settings-btn-danger-sm" onClick={() => remove(doc.id)}>Delete</button>
                </div>
              </div>
              {doc.description && (
                <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 4px' }}>{doc.description}</p>
              )}
              <div className="settings-kb-preview">
                {doc.content.slice(0, 200)}{doc.content.length > 200 ? '...' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Prompt Templates Section ─────────────────────────────────────────────────

function PromptTemplatesSection() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PromptTemplate | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await api<PromptTemplate[]>('/api/settings/ai-prompts')
    setPrompts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function startNew() {
    setIsNew(true)
    setEditing({
      id: '', feature: 'email', name: '', system_prompt: '',
      model: 'gpt-4o', temperature: 0.7, variables: [], is_active: true,
    })
  }

  async function save() {
    if (!editing) return
    await api('/api/settings/ai-prompts', {
      method: isNew ? 'POST' : 'PUT',
      body: JSON.stringify(editing),
    })
    setEditing(null)
    setIsNew(false)
    setTestOutput(null)
    load()
  }

  async function testGenerate() {
    if (!editing) return
    setTestLoading(true)
    setTestOutput(null)
    try {
      const sampleContext = `OPPORTUNITY DETAILS:
- Account: Acme Corp
- Opportunity: Acme Corp — Widget Pro Renewal 2025
- Owner/Rep: James Stothard
- Stage: Proposal
- ARR: $75,000
- Renewal Date: 2025-08-15
- Last Contact: 2025-03-28
- Days Since Renewal Call: 18
- Queue Status: needs_rep_review
- Flag Reason: Gate 2: within 90 days, no quote sent
- Health Score: 65
- Churn Risk: Medium

ACTIVITY HISTORY (2 entries):
  - 2025-03-28: [Call] Renewal Call — discussed pricing (by James Stothard)
  - 2025-03-15: [Email] Initial outreach sent (by James Stothard)`

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: editing.feature === 'email' ? 'email' : editing.feature,
          emailType: editing.feature === 'email' ? 'chase_quote_signature' : undefined,
          opportunity: {
            accountName: 'Acme Corp',
            opportunityName: 'Acme Corp — Widget Pro Renewal 2025',
            owner: 'James Stothard',
            stage: 'Proposal',
            arr: 75000,
            renewalDate: '2025-08-15',
            closeDate: '2025-08-15',
            lastContactDate: '2025-03-28',
            daysSinceLastRenewalCall: 18,
            queueStatus: 'needs_rep_review',
            flagReason: 'Gate 2: within 90 days, no quote sent',
            healthScore: 65,
            churnRiskCategory: 'Medium',
            nextStepOwner: 'James Stothard',
            description: 'Customer expressed interest in multi-year deal but concerned about price increase.',
          },
          activityHistory: [
            { date: '2025-03-28', type: 'Call', subject: 'Renewal Call — discussed pricing', performedBy: 'James Stothard', notes: '' },
            { date: '2025-03-15', type: 'Email', subject: 'Initial outreach sent', performedBy: 'James Stothard', notes: '' },
          ],
          question: editing.feature === 'question' ? 'What are the main risks with this deal?' : undefined,
        }),
      })
      const result = await res.json()
      if (result.error) {
        setTestOutput(`Error: ${result.error}`)
      } else if (result.subject) {
        setTestOutput(`Subject: ${result.subject}\n\n${result.body}`)
      } else {
        setTestOutput(result.text ?? JSON.stringify(result, null, 2))
      }
    } catch (err) {
      setTestOutput(`Error: ${err instanceof Error ? err.message : 'Request failed'}`)
    } finally {
      setTestLoading(false)
    }
  }

  if (loading) return <div className="settings-loading">Loading prompt templates...</div>

  if (editing) {
    return (
      <div className="settings-form">
        <div className="settings-form-header">
          <h3>{isNew ? 'New Prompt Template' : `Edit: ${editing.name}`}</h3>
          <button className="settings-btn-ghost" onClick={() => { setEditing(null); setIsNew(false); setTestOutput(null) }}>Cancel</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="settings-label">Template Name</label>
            <input
              className="settings-input"
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Call Objective Generator"
            />
          </div>
          <div>
            <label className="settings-label">Feature</label>
            <select
              className="settings-select"
              value={editing.feature}
              onChange={e => setEditing({ ...editing, feature: e.target.value })}
            >
              {FEATURES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="settings-label">Model</label>
            <select
              className="settings-select"
              value={editing.model}
              onChange={e => setEditing({ ...editing, model: e.target.value })}
            >
              {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="settings-label">Temperature: {editing.temperature.toFixed(1)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={editing.temperature}
              onChange={e => setEditing({ ...editing, temperature: parseFloat(e.target.value) })}
              className="settings-slider"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-meta)' }}>
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>
        </div>

        <label className="settings-label">
          System Prompt
          <span className="settings-var-hint">Available variables: {PROMPT_VARS.join(' ')}</span>
        </label>
        <textarea
          className="settings-textarea settings-mono"
          value={editing.system_prompt}
          onChange={e => setEditing({ ...editing, system_prompt: e.target.value })}
          placeholder="Write the system prompt that will be sent to the AI model..."
          rows={14}
        />

        <div className="settings-form-actions">
          <button className="settings-btn-secondary" onClick={testGenerate} disabled={testLoading}>
            {testLoading ? 'Generating...' : 'Test with Sample Data'}
          </button>
          <button className="settings-btn-primary" onClick={save} disabled={!editing.name.trim() || !editing.system_prompt.trim()}>
            {isNew ? 'Create Template' : 'Save Changes'}
          </button>
        </div>

        {testOutput && (
          <div className="settings-test-output">
            <label className="settings-label">Test Output <span style={{ color: 'var(--text-meta)', fontWeight: 400 }}>(Acme Corp / Widget Pro / $75K ARR)</span></label>
            <pre>{testOutput}</pre>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="settings-section-header">
        <div>
          <h3>Prompt Templates</h3>
          <p>System prompts for each AI feature. These control how the AI generates emails, summaries, call objectives, and chat responses.</p>
        </div>
        <button className="settings-btn-primary" onClick={startNew}>+ Add Template</button>
      </div>

      {prompts.length === 0 ? (
        <div className="settings-empty">No prompt templates configured. The AI will use hardcoded defaults.</div>
      ) : (
        <div className="settings-card-list">
          {prompts.map(pt => {
            const featureDef = FEATURES.find(f => f.value === pt.feature)
            const modelDef = MODELS.find(m => m.value === pt.model)
            return (
              <div key={pt.id} className={`settings-card ${!pt.is_active ? 'inactive' : ''}`}>
                <div className="settings-card-top">
                  <div className="settings-card-title-row">
                    <span className="settings-card-name">{pt.name}</span>
                    <span className="settings-badge" style={{ background: '#3b82f61a', color: '#3b82f6', borderColor: '#3b82f640' }}>
                      {featureDef?.label ?? pt.feature}
                    </span>
                  </div>
                  <div className="settings-card-actions">
                    <button className="settings-btn-ghost-sm" onClick={() => { setEditing(pt); setIsNew(false) }}>Edit</button>
                  </div>
                </div>
                <div className="settings-auto-meta">
                  <span className="settings-meta-item">
                    <span className="settings-meta-label">Model:</span>
                    {modelDef?.label ?? pt.model}
                  </span>
                  <span className="settings-meta-item">
                    <span className="settings-meta-label">Temp:</span>
                    {pt.temperature}
                  </span>
                </div>
                <div className="settings-kb-preview" style={{ marginTop: 6 }}>
                  {pt.system_prompt.slice(0, 180)}{pt.system_prompt.length > 180 ? '...' : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ── AI Behavior Settings Section ─────────────────────────────────────────────

function AIBehaviorSection() {
  const [settings, setSettings] = useState<AISettings>({
    default_model_email: 'gpt-4o',
    default_model_summary: 'gpt-4o',
    default_model_call_objective: 'gpt-4o',
    default_model_question: 'gpt-4o',
    default_temperature: 0.7,
    reasoning_effort: 'high',
    response_length: 'concise',
    tone_override: 'professional',
    include_description: true,
    include_activity_history: true,
    include_support_tickets: false,
    max_activity_count: 50,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await api<Record<string, unknown>>('/api/settings/ai-config')
      if (data && !('error' in data)) {
        setSettings(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, v])
          ),
        }) as AISettings)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    await api('/api/settings/ai-config', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <div className="settings-loading">Loading AI settings...</div>

  return (
    <>
      <div className="settings-section-header">
        <div>
          <h3>AI Behavior Settings</h3>
          <p>Global defaults for AI model selection, context inclusion, and output preferences.</p>
        </div>
      </div>

      <div className="settings-general-grid">
        {/* Default models per feature */}
        {FEATURES.map(f => {
          const key = `default_model_${f.value}` as keyof AISettings
          return (
            <div key={f.value} className="settings-general-card">
              <label className="settings-label">Default Model — {f.label}</label>
              <select
                className="settings-select"
                value={(settings[key] as string) ?? 'gpt-4o'}
                onChange={e => setSettings({ ...settings, [key]: e.target.value })}
              >
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )
        })}

        {/* Reasoning effort */}
        <div className="settings-general-card">
          <label className="settings-label">Reasoning Effort</label>
          <p className="settings-hint">Higher effort = better quality, slower responses.</p>
          <div className="settings-tone-row">
            {['standard', 'high'].map(e => (
              <button
                key={e}
                className={`settings-tone-btn ${settings.reasoning_effort === e ? 'active' : ''}`}
                style={{ borderColor: settings.reasoning_effort === e ? '#3b82f6' : undefined, color: settings.reasoning_effort === e ? '#3b82f6' : undefined }}
                onClick={() => setSettings({ ...settings, reasoning_effort: e })}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Response length */}
        <div className="settings-general-card">
          <label className="settings-label">Response Length</label>
          <p className="settings-hint">Controls how verbose AI outputs are.</p>
          <div className="settings-tone-row">
            {RESPONSE_LENGTHS.map(l => (
              <button
                key={l}
                className={`settings-tone-btn ${settings.response_length === l ? 'active' : ''}`}
                style={{ borderColor: settings.response_length === l ? '#3b82f6' : undefined, color: settings.response_length === l ? '#3b82f6' : undefined }}
                onClick={() => setSettings({ ...settings, response_length: l })}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Tone override */}
        <div className="settings-general-card">
          <label className="settings-label">Tone Override</label>
          <p className="settings-hint">Applied as a modifier to all AI-generated content.</p>
          <div className="settings-tone-row">
            {TONES.map(t => (
              <button
                key={t}
                className={`settings-tone-btn ${settings.tone_override === t ? 'active' : ''}`}
                style={{
                  borderColor: settings.tone_override === t ? '#3b82f6' : undefined,
                  color: settings.tone_override === t ? '#3b82f6' : undefined,
                }}
                onClick={() => setSettings({ ...settings, tone_override: t })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Context toggles */}
        <div className="settings-general-card">
          <label className="settings-label">Context Inclusion</label>
          <p className="settings-hint">What data is sent to the AI alongside the prompt.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <label className="settings-toggle-label">
              <button className="settings-toggle" onClick={() => setSettings({ ...settings, include_description: !settings.include_description })}>
                <span className={`settings-toggle-track ${settings.include_description ? 'on' : ''}`}>
                  <span className="settings-toggle-thumb" />
                </span>
              </button>
              Always include deal description
            </label>
            <label className="settings-toggle-label">
              <button className="settings-toggle" onClick={() => setSettings({ ...settings, include_activity_history: !settings.include_activity_history })}>
                <span className={`settings-toggle-track ${settings.include_activity_history ? 'on' : ''}`}>
                  <span className="settings-toggle-thumb" />
                </span>
              </button>
              Always include activity history
            </label>
            <label className="settings-toggle-label">
              <button className="settings-toggle" onClick={() => setSettings({ ...settings, include_support_tickets: !settings.include_support_tickets })}>
                <span className={`settings-toggle-track ${settings.include_support_tickets ? 'on' : ''}`}>
                  <span className="settings-toggle-thumb" />
                </span>
              </button>
              Include support tickets <span style={{ color: 'var(--text-meta)', fontSize: 10 }}>(Kayako — coming soon)</span>
            </label>
          </div>
        </div>

        {/* Max activity count */}
        <div className="settings-general-card">
          <label className="settings-label">Max Activities in Context: {settings.max_activity_count}</label>
          <p className="settings-hint">How many activity entries to include (10–100).</p>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={settings.max_activity_count}
            onChange={e => setSettings({ ...settings, max_activity_count: parseInt(e.target.value) })}
            className="settings-slider"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-meta)' }}>
            <span>10</span>
            <span>100</span>
          </div>
        </div>
      </div>

      <div className="settings-form-actions" style={{ marginTop: 16 }}>
        <button className="settings-btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>
    </>
  )
}

// ── Main AI Config Tab ───────────────────────────────────────────────────────

export default function AIConfigTab() {
  const [section, setSection] = useState<Section>('knowledge')

  return (
    <div>
      {/* Section switcher */}
      <div className="settings-section-switcher">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`settings-section-btn ${section === s.id ? 'active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            <span className="settings-section-btn-label">{s.label}</span>
            <span className="settings-section-btn-desc">{s.desc}</span>
          </button>
        ))}
      </div>

      {section === 'knowledge' && <KnowledgeBaseSection />}
      {section === 'prompts' && <PromptTemplatesSection />}
      {section === 'behavior' && <AIBehaviorSection />}
    </div>
  )
}
