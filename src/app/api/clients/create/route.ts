import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
