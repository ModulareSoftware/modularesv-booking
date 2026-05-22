import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')

  let query = supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { contract_number, client_id, package: pkg, start_date } = body

  if (!contract_number || !client_id || !pkg || !start_date) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const start = new Date(start_date + 'T12:00:00')

  const m1s = new Date(start)
  const m1e = new Date(start); m1e.setMonth(m1e.getMonth() + 1); m1e.setDate(m1e.getDate() - 1)
  const m2s = new Date(m1e); m2s.setDate(m2s.getDate() + 1)
  const m2e = new Date(m2s); m2e.setMonth(m2e.getMonth() + 1); m2e.setDate(m2e.getDate() - 1)
  const m3s = new Date(m2e); m3s.setDate(m3s.getDate() + 1)
  const m3e = new Date(m3s); m3e.setMonth(m3e.getMonth() + 1); m3e.setDate(m3e.getDate() - 1)

  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      contract_number,
      client_id,
      package: pkg,
      start_date,
      month1_start: fmt(m1s), month1_end: fmt(m1e),
      month2_start: fmt(m2s), month2_end: fmt(m2e),
      month3_start: fmt(m3s), month3_end: fmt(m3e),
      status: 'active'
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, status, package: pkg } = body

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const updateData: Record<string, unknown> = {}
  if (status !== undefined) updateData.status = status
  if (pkg !== undefined) updateData.package = pkg

  const { data, error } = await supabase
    .from('contracts')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
