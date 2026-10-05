import { NextRequest, NextResponse } from 'next/server'
import { supabase, PACKAGES, getVigencyEnd, fmtDate, quotaDate } from '@/lib/supabase'

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
  const { client_id, date, slot, is_admin_booking } = body
  if (!client_id || !date || !slot) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', client_id)
    .single()
  if (cErr || !client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Buscar el contrato que cubre la fecha (vigente o renovación ya registrada)
  const { data: clientContracts } = await supabase
    .from('contracts')
    .select('*')
    .eq('client_id', client_id)
    .in('status', ['active', 'upcoming'])
    .order('month1_start', { ascending: true })
  const contract = (clientContracts || []).find((c: any) => date >= c.month1_start && date <= c.month3_end)
    || (clientContracts || []).find((c: any) => c.status === 'active')
    || null

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

  // Límite de reserva anticipada: máximo 2 semanas, salvo reservas creadas por el administrador
  if (!is_admin_booking) {
    const maxBookable = new Date()
    maxBookable.setDate(maxBookable.getDate() + 14)
    maxBookable.setHours(23, 59, 59, 999)
    if (d > maxBookable) {
      return NextResponse.json({
        error: `Solo puedes reservar con un máximo de 2 semanas de anticipación. La fecha más lejana disponible por ahora es ${fmtDate(maxBookable)}.`
      }, { status: 400 })
    }
  }

  const isSunday = d.getDay() === 0
  let advanceMonthStart: string | null = null

  // Contar cuota solo del mes del contrato que corresponde a la fecha
  if (!isSunday && slot !== 'night') {
    let monthStart: string | null = null
    let monthEnd:   string | null = null
    let monthNum:   number | null = null

    if (contract) {
      for (const m of [1, 2, 3]) {
        const ms = new Date(contract[`month${m}_start`] + 'T00:00:00')
        const me = new Date(contract[`month${m}_end`]   + 'T23:59:59')
        if (d >= ms && d <= me) {
          monthStart = contract[`month${m}_start`]
          monthEnd   = contract[`month${m}_end`]
          monthNum   = m
          break
        }
      }
    } else {
      monthStart = client.start_date
      monthEnd   = getVigencyEnd(client.start_date).toISOString().slice(0, 10)
    }

    // Reservas de día (no domingo) del cliente; cada una cuenta en el mes de su quotaDate
    const { data: allRes } = await supabase
      .from('reservations')
      .select('date, slot, advance_month_start')
      .eq('client_id', client_id)
      .neq('slot', 'night')
    const dayRes = (allRes || []).filter(r => new Date(r.date + 'T12:00:00').getDay() !== 0)
    const countIn = (from: string, to: string) =>
      dayRes.filter(r => { const q = quotaDate(r); return q >= from && q <= to }).length

    const usedQuota = countIn(monthStart!, monthEnd!)
    const total = PACKAGES[(contract?.package || client.package) as keyof typeof PACKAGES].dayBlocks

    if (body.use_next_month) {
      // Adelantar un turno del mes siguiente (solo clientes habilitados)
      if (!client.allow_advance) {
        return NextResponse.json({ error: 'Este cliente no tiene habilitado adelantar turnos del mes siguiente' }, { status: 403 })
      }
      if (!contract || !monthNum || monthNum >= 3) {
        return NextResponse.json({ error: 'No hay un mes siguiente en el contrato del cual adelantar turnos' }, { status: 400 })
      }
      if (usedQuota < total) {
        return NextResponse.json({ error: 'Aún tienes bloques disponibles en este mes; usa esos primero' }, { status: 400 })
      }
      const nextStart = contract[`month${monthNum + 1}_start`]
      const nextEnd   = contract[`month${monthNum + 1}_end`]
      const nextUsed  = countIn(nextStart, nextEnd)
      if (nextUsed >= total) {
        return NextResponse.json({ error: `El mes siguiente ya no tiene bloques disponibles para adelantar (${nextUsed}/${total})` }, { status: 400 })
      }
      advanceMonthStart = nextStart
    } else if (usedQuota >= total && !body.is_extra) {
      return NextResponse.json({
        error: `Sin bloques disponibles (${usedQuota}/${total} usados este mes)`
      }, { status: 400 })
    }
  }

  // Insert
  const { data, error } = await supabase
    .from('reservations')
    .insert(advanceMonthStart ? { client_id, date, slot, advance_month_start: advanceMonthStart } : { client_id, date, slot })
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
