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
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', client_id)
    .single()
  if (cErr || !client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Buscar contrato activo
  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('client_id', client_id)
    .eq('status', 'active')
    .single()

  const d = new Date(date + 'T12:00:00')

  // Validar vigencia
  if (contract) {
    const contractStart = new Date(contract.month1_start + 'T00:00:00')
    const contractEnd   = new Date(contract.month3_end   + 'T23:59:59')
    if (d < contractStart || d > contractEnd) {
      return NextResponse.json({
        error: `Fecha fuera del período del contrato (${contract.month1_start} – ${contract.month3_end})`
      }, { status: 400 })
    }
  } else {
    const start = new Date(client.start_date + 'T12:00:00')
    const end   = getVigencyEnd(client.start_date)
    if (d < start || d > end) {
      return NextResponse.json({
        error: `Fecha fuera del período de vigencia (${client.start_date} – ${end.toISOString().slice(0, 10)})`
      }, { status: 400 })
    }
  }

  const isSunday = d.getDay() === 0

  // Contar cuota solo del mes del contrato que corresponde a la fecha
  if (!isSunday && slot !== 'night') {
    let monthStart: string | null = null
    let monthEnd:   string | null = null

    if (contract) {
      for (const m of [1, 2, 3]) {
        const ms = new Date(contract[`month${m}_start`] + 'T00:00:00')
        const me = new Date(contract[`month${m}_end`]   + 'T23:59:59')
        if (d >= ms && d <= me) {
          monthStart = contract[`month${m}_start`]
          monthEnd   = contract[`month${m}_end`]
          break
        }
      }
    } else {
      monthStart = client.start_date
      monthEnd   = getVigencyEnd(client.start_date).toISOString().slice(0, 10)
    }

    const { data: allRes } = await supabase
      .from('reservations')
      .select('date, slot')
      .eq('client_id', client_id)
      .neq('slot', 'night')
      .gte('date', monthStart)
      .lte('date', monthEnd)

    const usedQuota = (allRes || []).filter(r =>
      new Date(r.date + 'T12:00:00').getDay() !== 0
    ).length

    const total = PACKAGES[client.package as keyof typeof PACKAGES].blocks

    if (usedQuota >= total && !body.is_extra) {
      return NextResponse.json({
        error: `Sin bloques disponibles (${usedQuota}/${total} usados este mes)`
      }, { status: 400 })
    }
  }

  // Insert
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
