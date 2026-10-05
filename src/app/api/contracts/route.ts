import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Cliente con service role: las escrituras de contratos no dependen de las políticas RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Estados de contrato:
//  active    → contrato en curso (o vencido sin renovar, si ya pasó month3_end)
//  upcoming  → renovación ya registrada que aún no inicia
//  finished  → contrato cerrado (histórico)
//  cancelled → anulado

const fmt = (d: Date) => d.toISOString().slice(0, 10)

// Fecha de hoy en El Salvador (UTC-6), formato YYYY-MM-DD
function todaySV(): string {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function calcContractMonths(start_date: string) {
  const start = new Date(start_date + 'T12:00:00')
  const m1s = new Date(start)
  const m1e = new Date(start); m1e.setMonth(m1e.getMonth() + 1); m1e.setDate(m1e.getDate() - 1)
  const m2s = new Date(m1e); m2s.setDate(m2s.getDate() + 1)
  const m2e = new Date(m2s); m2e.setMonth(m2e.getMonth() + 1); m2e.setDate(m2e.getDate() - 1)
  const m3s = new Date(m2e); m3s.setDate(m3s.getDate() + 1)
  const m3e = new Date(m3s); m3e.setMonth(m3e.getMonth() + 1); m3e.setDate(m3e.getDate() - 1)
  return {
    month1_start: fmt(m1s), month1_end: fmt(m1e),
    month2_start: fmt(m2s), month2_end: fmt(m2e),
    month3_start: fmt(m3s), month3_end: fmt(m3e),
  }
}

function dayAfter(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return fmt(d)
}

async function generateContractNumber(): Promise<string> {
  const { data } = await supabaseAdmin.from('contracts').select('contract_number')
  let maxNum = 0
  for (const row of data || []) {
    const match = String(row.contract_number || '').match(/C(\d+)/)
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]))
  }
  return `C${String(maxNum + 1).padStart(3, '0')}`
}

// Activa automáticamente las renovaciones cuyo periodo ya inició
// y cierra el contrato anterior. Se ejecuta en cada GET.
async function syncStatuses(clientId: string | null) {
  const today = todaySV()
  let q = supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('status', 'upcoming')
    .lte('month1_start', today)
  if (clientId) q = q.eq('client_id', clientId)
  const { data: due } = await q
  for (const next of due || []) {
    // Cerrar el contrato que estaba activo para ese cliente
    await supabaseAdmin
      .from('contracts')
      .update({ status: 'finished', finished_at: today })
      .eq('client_id', next.client_id)
      .eq('status', 'active')
    // Activar la renovación
    await supabaseAdmin.from('contracts').update({ status: 'active' }).eq('id', next.id)
    // El paquete del cliente pasa a ser el de la renovación
    await supabaseAdmin.from('clients').update({ package: next.package }).eq('id', next.client_id)
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')

  await syncStatuses(clientId)

  let query = supabaseAdmin
    .from('contracts')
    .select('*')
    .order('month1_start', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // ── Renovación (prórroga) de un contrato existente ──
  if (body.action === 'renew') {
    const { previous_contract_id, package: pkg } = body
    if (!previous_contract_id) {
      return NextResponse.json({ error: 'Falta el contrato a renovar' }, { status: 400 })
    }
    const { data: prev, error: pErr } = await supabaseAdmin
      .from('contracts').select('*').eq('id', previous_contract_id).single()
    if (pErr || !prev) return NextResponse.json({ error: 'Contrato anterior no encontrado' }, { status: 404 })

    const { data: existing } = await supabaseAdmin
      .from('contracts').select('id, contract_number')
      .eq('previous_contract_id', previous_contract_id)
      .neq('status', 'cancelled')
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: `Este contrato ya tiene una renovación registrada (${existing[0].contract_number})` }, { status: 409 })
    }

    const start_date = body.start_date || dayAfter(prev.month3_end)
    const num = await generateContractNumber()
    const suffix = String(prev.contract_number || '').split('-')[1]
    const contract_number = suffix ? `${num}-${suffix}` : num

    const { data, error } = await supabaseAdmin
      .from('contracts')
      .insert({
        contract_number,
        client_id: prev.client_id,
        package: pkg || prev.package,
        start_date,
        ...calcContractMonths(start_date),
        status: 'upcoming',
        previous_contract_id,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Si la renovación se registra cuando su periodo ya empezó, se activa de una vez
    await syncStatuses(prev.client_id)
    // La solicitud del cliente queda atendida
    await supabaseAdmin.from('contracts').update({ renewal_request: 'renovar' }).eq('id', previous_contract_id)

    return NextResponse.json(data, { status: 201 })
  }

  // ── Creación directa de contrato (uso original) ──
  const { contract_number, client_id, package: pkg, start_date } = body
  if (!contract_number || !client_id || !pkg || !start_date) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('contracts')
    .insert({
      contract_number,
      client_id,
      package: pkg,
      start_date,
      ...calcContractMonths(start_date),
      status: 'active'
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, status, package: pkg, renewal_request } = body

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const updateData: Record<string, unknown> = {}
  if (status !== undefined) {
    updateData.status = status
    if (status === 'finished') updateData.finished_at = todaySV()
  }
  if (pkg !== undefined) updateData.package = pkg
  if (renewal_request !== undefined) {
    // 'renovar' | 'no_renovar' | null
    updateData.renewal_request = renewal_request
    updateData.renewal_request_at = renewal_request ? new Date().toISOString() : null
  }

  const { data, error } = await supabaseAdmin
    .from('contracts')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
