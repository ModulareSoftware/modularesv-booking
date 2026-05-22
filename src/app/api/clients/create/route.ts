import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function calcContractMonths(start_date: string) {
  const start = new Date(start_date + 'T12:00:00')
  const m1s = new Date(start)
  const m1e = new Date(start); m1e.setMonth(m1e.getMonth() + 1); m1e.setDate(m1e.getDate() - 1)
  const m2s = new Date(m1e); m2s.setDate(m2s.getDate() + 1)
  const m2e = new Date(m2s); m2e.setMonth(m2e.getMonth() + 1); m2e.setDate(m2e.getDate() - 1)
  const m3s = new Date(m2e); m3s.setDate(m3s.getDate() + 1)
  const m3e = new Date(m3s); m3e.setMonth(m3e.getMonth() + 1); m3e.setDate(m3e.getDate() - 1)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return {
    month1_start: fmt(m1s), month1_end: fmt(m1e),
    month2_start: fmt(m2s), month2_end: fmt(m2e),
    month3_start: fmt(m3s), month3_end: fmt(m3e),
  }
}

async function generateContractNumber(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('contracts')
    .select('contract_number')
    .order('created_at', { ascending: false })
    .limit(1)
  let nextNum = 1
  if (data && data.length > 0) {
    const last = data[0].contract_number
    const match = last.match(/C(\d+)/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  return `C${String(nextNum).padStart(3, '0')}`
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = await req.json()
  const { name, company_name, contact, package: pkg, start_date, night_price, sunday_price, password, deposit_amount, deposit_status, deposit_date } = body
  if (!name || !pkg || !start_date || !contact || !password) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: contact,
    password,
    email_confirm: true,
  })
  if (authError) {
    return NextResponse.json({ error: `Error creando usuario: ${authError.message}` }, { status: 500 })
  }
  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({
      name,
      company_name: company_name || null,
      contact,
      package: pkg,
      start_date,
      night_price: night_price || 25,
      sunday_price: sunday_price || 25,
      extra_block_price: body.extra_block_price || 25,
      deposit_amount: deposit_amount || 0,
      deposit_status: deposit_status || 'pendiente',
      deposit_date: deposit_date || null,
      auth_user_id: authUser.user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generar contrato automáticamente
  const contractNum = await generateContractNumber()
  const initials = name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
  const contractNumber = `${contractNum}-${initials}`
  const months = calcContractMonths(start_date)
  await supabaseAdmin.from('contracts').insert({
    contract_number: contractNumber,
    client_id: data.id,
    package: pkg,
    start_date,
    ...months,
    status: 'active'
  })

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = await req.json()
  const { id, name, company_name, contact, package: pkg, start_date, night_price, sunday_price, password, deposit_amount, deposit_status, deposit_date } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (company_name !== undefined) updateData.company_name = company_name || null
  if (contact !== undefined) updateData.contact = contact
  if (pkg !== undefined) updateData.package = pkg
  if (start_date !== undefined) updateData.start_date = start_date
  if (night_price !== undefined) updateData.night_price = night_price
  if (sunday_price !== undefined) updateData.sunday_price = sunday_price
  if (body.extra_block_price !== undefined) updateData.extra_block_price = body.extra_block_price
  if (deposit_amount !== undefined) updateData.deposit_amount = deposit_amount
  if (deposit_status !== undefined) updateData.deposit_status = deposit_status
  if (deposit_date !== undefined) updateData.deposit_date = deposit_date || null
  const { data, error } = await supabaseAdmin
    .from('clients')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (password && data.auth_user_id) {
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(data.auth_user_id, { password })
    if (pwErr) return NextResponse.json({ error: `Cliente actualizado pero error en contraseña: ${pwErr.message}` }, { status: 500 })
  }
  if (contact && data.auth_user_id) {
    const { error: emailErr } = await supabaseAdmin.auth.admin.updateUserById(data.auth_user_id, { email: contact })
    if (emailErr) return NextResponse.json({ error: `Cliente actualizado pero error en correo: ${emailErr.message}` }, { status: 500 })
  }
  return NextResponse.json(data)
}
