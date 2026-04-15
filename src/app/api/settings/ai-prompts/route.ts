import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .select('*')
    .order('feature', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .insert({
      feature: body.feature,
      name: body.name,
      system_prompt: body.system_prompt,
      model: body.model ?? 'gpt-4o',
      temperature: body.temperature ?? 0.7,
      variables: body.variables ?? [],
      is_active: body.is_active ?? true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  if (!body.id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .update({
      feature: body.feature,
      name: body.name,
      system_prompt: body.system_prompt,
      model: body.model,
      temperature: body.temperature,
      variables: body.variables,
      is_active: body.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
