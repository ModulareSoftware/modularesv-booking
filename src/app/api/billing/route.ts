import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')

  let query = supabase
    .from('billing_months')
    .select('*')
    .order('month_start', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { client_id, month_start, month_end, package_status, contract_month } = body
  const { data, error } = await supabase
    .from('billing_months')
    .upsert(
      { client_id, month_start, month_end, package_status, contract_month: contract_month || 1 },
      { onConflict: 'client_id,month_start' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
