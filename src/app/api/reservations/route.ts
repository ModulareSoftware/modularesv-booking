import { NextRequest, NextResponse } from 'next/server'
import { supabase, PACKAGES, getVigencyEnd } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')

  let query = supabase
    .from('reservations')
    .select('*, client:clients(*)')
    .order('date', { ascending: true })

  if (clientId) query = query.eq('client_id', clientId)
  if (from)     query = query.gte('date', from)
  if (to)       query = query.lte('date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { client_id, date, slot } = body

  if (!client_id || !date || !slot) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  // Fetch client
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', client_id)
    .single()

  if (cErr || !client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Check vigency
  const start = new Date(client.start_date + 'T12:00:00')
  const end   = getVigencyEnd(client.start_date)
  const d     = new Date(date + 'T12:00:00')
  if (d < start || d > end) {
    return NextResponse.json({ error: `Fecha fuera del período de vigencia (${client.start_date} – ${end.toISOString().slice(0, 10)})` }, { status: 400 })
  }

  // Check sunday
  if (d.getDay() === 0) {
    return NextResponse.json({ error: 'No se puede reservar los domingos' }, { status: 400 })
  }

  // Check block quota (night doesn't count against package blocks)
  if (slot !== 'night') {
    const { count } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client_id)
      .neq('slot', 'night')

    const used  = count ?? 0
    const total = PACKAGES[client.package as keyof typeof PACKAGES].blocks
    if (used >= total) {
      return NextResponse.json({ error: `Sin bloques disponibles (${used}/${total} usados)` }, { status: 400 })
    }
  }

  // Insert — unique(date, slot) constraint handles conflicts automatically
  const { data, error } = await supabase
    .from('reservations')
    .insert({ client_id, date, slot })
    .select('*, client:clients(*)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ese bloque ya está reservado por otro cliente' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
