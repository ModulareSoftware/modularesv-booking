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
  const { name, contact, package: pkg, start_date, night_price, password } = body

  if (!name || !pkg || !start_date || !contact || !password) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  // 1. Create auth user
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: contact,
    password: password,
    email_confirm: true,
  })

  if (authError) {
    return NextResponse.json({ error: `Error creando usuario: ${authError.message}` }, { status: 500 })
  }

  // 2. Create client record linked to auth user
  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({
      name,
      contact,
      package: pkg,
      start_date,
      night_price: night_price || 25,
      auth_user_id: authUser.user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
