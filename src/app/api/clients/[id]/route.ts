import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  // Obtener auth_user_id antes de eliminar
  const { data: client } = await supabase.from('clients').select('auth_user_id').eq('id', params.id).single()
  
  const { error } = await supabase.from('clients').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  // Eliminar usuario de Auth si existe
  if (client?.auth_user_id) {
    await supabaseAdmin.auth.admin.deleteUser(client.auth_user_id)
  }
  
  return NextResponse.json({ ok: true })
}
