'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Client, Reservation, PACKAGES, SLOTS, fmtDate, daysLeft, getVigencyEnd, ADMIN_EMAIL, isSunday, countsAgainstQuota, displayName, fmt$, DEPOSIT_STATUS, DepositStatus } from '@/lib/supabase'

const ADMIN_SECRET = 'Modular2024!'
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_ES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const IVA = 0.13

function authHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_SECRET }
}

interface BillingMonth {
  id: string
  client_id: string
  month_start: string
  month_end: string
  package_status: 'pendiente' | 'pagado'
  package_paid_at: string | null
}

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'calendar' | 'clients' | 'reservations' | 'billing'>('calendar')
  const [calView, setCalView] = useState<'week' | 'month'>('week')
  const [clients, setClients] = useState<Client[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [billingMonths, setBillingMonths] = useState<BillingMonth[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showNewClient, setShowNewClient] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [showNewRes, setShowNewRes] = useState<{ date?: string; slot?: string } | null>(null)
const [editingRes, setEditingRes] = useState<Reservation | null>(null)
  const [filterClient, setFilterClient] = useState('')
  const [billingClient, setBillingClient] = useState('')
  const [billingVigency, setBillingVigency] = useState('')
  const [alert, setAlert] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.email !== ADMIN_EMAIL) router.push('/login')
    }
    checkAuth()
  }, [router])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const loadData = useCallback(async () => {
    const [cRes, rRes, bRes] = await Promise.all([
      fetch('/api/clients'),
      fetch('/api/reservations'),
      fetch('/api/billing'),
    ])
    setClients(await cRes.json())
    setReservations(await rRes.json())
    setBillingMonths(await bRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function getWeekDays() {
    const today = new Date()
    const dow = today.getDay() === 0 ? 7 : today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dow - 1) + weekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i); return d
    })
  }

  function getMonthDays() {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() + monthOffset
    const ref = new Date(year, month, 1)
    const firstDay = ref.getDay()
    const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
    return { ref, firstDay, daysInMonth }
  }

  const weekDays = getWeekDays()
  const todayStr = (() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
})()

  function getRes(dateStr: string, slot: string) {
    return reservations.find(r => r.date === dateStr && r.slot === slot)
  }

  function getResForDay(dateStr: string) {
    return reservations.filter(r => r.date === dateStr)
  }

  function getClientUsage(c: Client) {
    const clientRes = reservations.filter(r => r.client_id === c.id)
    const used = clientRes.filter(r => countsAgainstQuota(r.date, r.slot)).length
    const nights = clientRes.filter(r => r.slot === 'night' && !isSunday(r.date)).length
    const sundays = clientRes.filter(r => isSunday(r.date)).length
    const total = PACKAGES[c.package].blocks
    return { used, nights, sundays, total, remaining: total - used }
  }

  function getClientBilling(c: Client) {
    const pkg = PACKAGES[c.package]
    const clientRes = billingReservations(c.id)
    const nights = clientRes.filter(r => r.slot === 'night' && !isSunday(r.date)).length
    const sundays = clientRes.filter(r => isSunday(r.date)).length
    const usedQuota = clientRes.filter(r => countsAgainstQuota(r.date, r.slot)).length
    const extraBlocks = Math.max(0, usedQuota - pkg.blocks)
    const extraBlockPrice = (c as any).extra_block_price || 25
    const baseNeto = pkg.price
    const nightNeto = nights * c.night_price
    const sundayNeto = sundays * (c.sunday_price || 25)
    const extraBlockNeto = extraBlocks * extraBlockPrice
    const totalNeto = baseNeto + nightNeto + sundayNeto + extraBlockNeto
    return {
      baseNeto, nightNeto, sundayNeto, extraBlockNeto, totalNeto,
      baseIva: baseNeto * IVA, nightIva: nightNeto * IVA, sundayIva: sundayNeto * IVA,
      extraBlockIva: extraBlockNeto * IVA,
      totalIva: totalNeto * IVA, totalConIva: totalNeto * (1 + IVA),
      nights, sundays, extraBlocks, extraBlockPrice,
    }
  }

  function getExtraReservations(c: Client) {
    const now = new Date()
    return reservations
      .filter(r => r.client_id === c.id && (r.slot === 'night' || isSunday(r.date)))
      .map(r => {
        const resDate = new Date(r.date + 'T23:59:00')
        const slotEnd = r.slot === 'night' ? new Date(r.date + 'T21:00:00') : new Date(r.date + 'T23:59:00')
        let chargeStatus = (r as any).charge_status || 'programado'
        if (chargeStatus === 'programado' && slotEnd < now) chargeStatus = 'por_cobrar'
        return { ...r, chargeStatus }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  function getCurrentBillingMonth(c: Client) {
    return billingMonths.find(b => b.client_id === c.id &&
      new Date(b.month_start + 'T00:00:00') <= new Date() &&
      new Date(b.month_end + 'T23:59:59') >= new Date()
    )
  }

  async function togglePackageStatus(c: Client) {
    const current = getCurrentBillingMonth(c)
    const start = new Date(c.start_date)
    const end = getVigencyEnd(c.start_date)
    const newStatus = current?.package_status === 'pagado' ? 'pendiente' : 'pagado'

    await fetch('/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: c.id,
        month_start: fmtDate(start),
        month_end: fmtDate(end),
        package_status: newStatus,
      }),
    })
    await loadData()
  }

  async function markChargeStatus(reservationId: string, status: string) {
    await fetch(`/api/reservations/${reservationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ charge_status: status }),
    })
    await loadData()
  }

  async function markAllExtras(c: Client, status: string) {
    const extras = getExtraReservations(c).filter(r => r.chargeStatus !== 'programado')
    await Promise.all(extras.map(r =>
      fetch(`/api/reservations/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charge_status: status }),
      })
    ))
    loadData()
  }

  async function deleteReservation(id: string, isPast: boolean) {
  if (isPast) {
    if (!confirm('⚠️ Esta reserva es del pasado. ¿Estás seguro de que quieres eliminarla?')) return
    if (!confirm('Segunda confirmación: se eliminará del historial permanentemente. ¿Continuar?')) return
  } else {
    if (!confirm('¿Cancelar esta reserva?')) return
  }
  await fetch(`/api/reservations/${id}`, { method: 'DELETE', headers: authHeaders() })
  loadData()
}

async function editReservation(id: string, date: string, slot: string) {
  await fetch(`/api/reservations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, slot }),
  })
  loadData()
}

  async function deleteClient(id: string) {
    if (!confirm('¿Eliminar cliente y todas sus reservas?')) return
    await fetch(`/api/clients/${id}`, { method: 'DELETE', headers: authHeaders() })
    loadData()
  }

  const slotColors: Record<string, string> = {
    morning: 'bg-blue-50 border-blue-300 text-blue-800',
    afternoon: 'bg-green-50 border-green-300 text-green-800',
    night: 'bg-amber-50 border-amber-300 text-amber-800',
  }
  const slotDots: Record<string, string> = {
    morning: 'bg-blue-400', afternoon: 'bg-green-400', night: 'bg-amber-400',
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando datos…</div>

  const { ref: monthRef, firstDay, daysInMonth } = getMonthDays()
  const billingClients = clients.filter(c => {
    if (billingClient && c.id !== billingClient) return false
    if (billingVigency === 'active' && daysLeft(c.start_date) <= 0) return false
    if (billingVigency === 'expired' && daysLeft(c.start_date) > 0) return false
    return true
  })

  const billingReservations = (clientId: string) => reservations.filter(r => r.client_id === clientId)
  const totalNetoMes = billingClients.reduce((sum, c) => sum + getClientBilling(c).totalNeto, 0)
  const totalIvaMes = totalNetoMes * IVA
  const totalConIvaMes = totalNetoMes * (1 + IVA)

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 mr-auto">
  <img
    src="/Logo%20M%20Negro.png"
    alt="Modulare"
    className="w-10 h-10 object-contain"
  />
  <span className="text-xl font-semibold text-slate-800" style={{ fontFamily: 'Fraunces, serif' }}>Modulare Flex Office</span>
</div>
        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Admin</span>
        {(['calendar', 'clients', 'reservations', 'billing'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-sm px-3 py-1.5 rounded-lg transition-all ${tab === t ? 'bg-slate-100 font-medium' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'calendar' ? '📅 Calendario' : t === 'clients' ? '👥 Clientes' : t === 'reservations' ? '📋 Reservas' : '💰 Facturación'}
          </button>
        ))}
        <button onClick={() => setShowNewClient(true)} className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700">+ Cliente</button>
        <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">Salir</button>
      </nav>

      {alert && (
        <div className={`mx-4 mt-4 p-3 rounded-xl text-sm ${alert.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {alert.msg} <button onClick={() => setAlert(null)} className="ml-2 opacity-50">✕</button>
        </div>
      )}

      <div className="p-4 max-w-6xl mx-auto">

        {/* ── CALENDAR ── */}
        {tab === 'calendar' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <h2 className="font-semibold text-slate-700 mr-auto">
                {calView === 'week'
                  ? `${weekDays[0].toLocaleDateString('es-SV', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : `${MONTHS_ES[monthRef.getMonth()]} ${monthRef.getFullYear()}`}
              </h2>
              <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
                <button onClick={() => setCalView('week')} className={`text-xs px-3 py-1.5 rounded-md transition-all ${calView === 'week' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>Semana</button>
                <button onClick={() => setCalView('month')} className={`text-xs px-3 py-1.5 rounded-md transition-all ${calView === 'month' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>Mes</button>
              </div>
              {calView === 'week' ? (
                <>
                  <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg hover:bg-slate-100">‹</button>
                  <button onClick={() => setWeekOffset(0)} className="text-xs px-2 py-1.5 rounded-lg hover:bg-slate-100">Hoy</button>
                  <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg hover:bg-slate-100">›</button>
                </>
              ) : (
                <>
                  <button onClick={() => setMonthOffset(m => m - 1)} className="p-1.5 rounded-lg hover:bg-slate-100">‹</button>
                  <button onClick={() => setMonthOffset(0)} className="text-xs px-2 py-1.5 rounded-lg hover:bg-slate-100">Hoy</button>
                  <button onClick={() => setMonthOffset(m => m + 1)} className="p-1.5 rounded-lg hover:bg-slate-100">›</button>
                </>
              )}
              <button onClick={() => setShowNewRes({})} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">+ Reserva</button>
            </div>

            {calView === 'week' && (
              <>
                <div className="grid gap-1" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                  <div />
                  {weekDays.map(d => {
                    const isDom = d.getDay() === 0
                    return (
                      <div key={d.toISOString()} className={`text-center text-xs font-medium py-1 rounded-lg ${fmtDate(d) === todayStr ? 'bg-blue-50 text-blue-600' : isDom ? 'bg-purple-50 text-purple-500' : 'text-slate-400'}`}>
                        {DAYS_ES[d.getDay()]}<br /><span className="font-semibold text-sm">{d.getDate()}</span>
                      </div>
                    )
                  })}
                  {(['morning', 'afternoon', 'night'] as const).map(slot => (
                    <>
                      <div key={slot + '-label'} className="flex flex-col items-end justify-center pr-2 text-xs text-slate-400">
                        <span>{SLOTS[slot].emoji}</span>
                        <span>{slot === 'morning' ? '7–12' : slot === 'afternoon' ? '1–5' : '6–9'}</span>
                      </div>
                      {weekDays.map(d => {
                        const dateStr = fmtDate(d)
                        const res = getRes(dateStr, slot)
                        const client = res ? clients.find(c => c.id === res.client_id) : null
                        const isDom = d.getDay() === 0
                        return (
                          <div key={dateStr + slot}
                            onClick={() => res ? setEditingRes(res) : setShowNewRes({ date: dateStr, slot })}
                            className={`min-h-12 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center text-center p-1
                              ${res ? slotColors[slot] : isDom ? 'border-purple-100 bg-purple-50 hover:border-purple-300' : 'border-slate-100 bg-slate-50 hover:border-blue-300 hover:bg-blue-50'}`}>
                            {client ? <span className="text-xs font-medium leading-tight">{displayName(client).split(' ')[0]}</span> : <span className={`text-lg ${isDom ? 'text-purple-200' : 'text-slate-200'}`}>+</span>}
                          </div>
                        )
                      })}
                    </>
                  ))}
                </div>
                <div className="flex gap-4 mt-3 text-xs text-slate-400 flex-wrap">
                  <span><span className="inline-block w-3 h-3 rounded bg-blue-200 mr-1" />Mañana</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-green-200 mr-1" />Tarde</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-amber-200 mr-1" />Noche extra</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-purple-100 mr-1" />Domingo</span>
                  <span className="ml-auto">Clic en celda ocupada = cancelar</span>
                </div>
              </>
            )}

            {calView === 'month' && (
              <>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {DAYS_ES_SHORT.map((d, i) => (
                    <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? 'text-purple-400' : 'text-slate-400'}`}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDay }).map((_, i) => <div key={'empty-' + i} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dateStr = `${monthRef.getFullYear()}-${String(monthRef.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const dayRes = getResForDay(dateStr)
                    const isToday = dateStr === todayStr
                    const isDom = new Date(dateStr + 'T12:00:00').getDay() === 0
                    return (
                      <div key={dateStr} onClick={() => setShowNewRes({ date: dateStr })}
                        className={`min-h-16 rounded-xl border p-1.5 transition-all cursor-pointer
                          ${isToday ? 'border-blue-300 bg-blue-50' : isDom ? 'border-purple-100 bg-purple-50 hover:border-purple-300' : 'border-slate-100 hover:border-slate-300'}`}>
                        <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-blue-600' : isDom ? 'text-purple-500' : 'text-slate-500'}`}>{day}</div>
                        <div className="flex flex-col gap-0.5">
                          {dayRes.map(r => {
                            const c = clients.find(x => x.id === r.client_id)
                            return (
                              <div key={r.id} onClick={e => { e.stopPropagation(); setEditingRes(r) }}
                                className={`flex items-center gap-1 px-1 py-0.5 rounded text-xs cursor-pointer hover:opacity-75
                                  ${r.slot === 'morning' ? 'bg-blue-100 text-blue-700' : r.slot === 'afternoon' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slotDots[r.slot]}`} />
                                <span className="truncate">{c ? displayName(c).split(' ')[0] : ''}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-4 mt-3 text-xs text-slate-400 flex-wrap">
                  <span><span className="inline-block w-3 h-3 rounded bg-blue-200 mr-1" />Mañana</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-green-200 mr-1" />Tarde</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-amber-200 mr-1" />Noche extra</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-purple-100 mr-1" />Domingo</span>
                  <span className="ml-auto">Clic en día = nueva reserva · Clic en bloque = cancelar</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── CLIENTS ── */}
        {tab === 'clients' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h2 className="font-semibold text-slate-700 mb-4">Clientes registrados</h2>
            {clients.length === 0 && <p className="text-slate-400 text-sm text-center py-8">Sin clientes.</p>}
            <div className="space-y-3">
              {clients.map(c => {
                const { used, nights, sundays, total, remaining: rawRemaining } = getClientUsage(c)
const remaining = Math.max(0, rawRemaining)
const extraBlocksCount = rawRemaining < 0 ? Math.abs(rawRemaining) : 0
const extraBlockPrice = (c as any).extra_block_price || 25
                const pct = Math.round((used / total) * 100)
                const dl = daysLeft(c.start_date)
                const end = getVigencyEnd(c.start_date)
                const pkg = PACKAGES[c.package]
                const depStatus = DEPOSIT_STATUS[c.deposit_status]
                return (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                      {displayName(c).split(' ').map((x: string) => x[0]).slice(0, 2).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{displayName(c)}</span>
                        {c.company_name && <span className="text-xs text-slate-400">({c.name})</span>}
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{pkg.label}</span>
                        {dl <= 5 && <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">⚠️ {dl}d</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{used}/{total} bloques · vence {end.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                        {nights > 0 && <span>· {nights} noches</span>}
                        {sundays > 0 && <span>· {sundays} domingos</span>}
                        {extraBlocksCount > 0 && <span>· {extraBlocksCount} bloques extra</span>}
                        {c.deposit_amount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${depStatus.color}`}>
                            Depósito {fmt$(c.deposit_amount)} · {depStatus.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${remaining === 0 ? 'bg-red-50 text-red-600' : remaining <= 1 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                        {remaining} disp.
                      </span>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingClient(c)} className="text-xs text-blue-400 hover:text-blue-600">editar</button>
                        <button onClick={() => deleteClient(c.id)} className="text-xs text-slate-300 hover:text-red-400">eliminar</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── RESERVATIONS ── */}
        {tab === 'reservations' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="font-semibold text-slate-700 mr-auto">Todas las reservas</h2>
              <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white">
                <option value="">Todos los clientes</option>
                {clients.map(c => <option key={c.id} value={c.id}>{displayName(c)}</option>)}
              </select>
            </div>
            {(() => {
              const filtered = reservations.filter(r => !filterClient || r.client_id === filterClient).sort((a, b) => a.date.localeCompare(b.date))
              if (!filtered.length) return <p className="text-slate-400 text-sm text-center py-8">Sin reservas</p>
              return (
                <div className="space-y-2">
                  {filtered.map(r => {
                    const c = clients.find(x => x.id === r.client_id)
                    const slot = SLOTS[r.slot as keyof typeof SLOTS]
                    const isDom = isSunday(r.date)
                    return (
                      <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.slot === 'morning' ? 'bg-blue-400' : r.slot === 'afternoon' ? 'bg-green-400' : 'bg-amber-400'}`} />
                        <div className="flex-1 text-sm">
                          <span className="font-medium">{c ? displayName(c) : '?'}</span>
                          <span className="text-slate-400"> · {new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} · {slot.label}</span>
                          {isDom && <span className="ml-1 text-xs text-purple-600">🗓️ dom</span>}
                          {r.slot === 'night' && !isDom && <span className="ml-2 text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">noche</span>}
                        </div>
                        <button onClick={() => setEditingRes(r)} className="text-xs text-slate-300 hover:text-red-400">✕</button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── BILLING ── */}
        {tab === 'billing' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <h2 className="font-semibold text-slate-700">Facturación del mes en curso</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Basado en reservas activas · IVA 13%</p>
                </div>
               <div className="flex gap-2 flex-wrap ml-auto">
                  <select value={billingClient} onChange={e => setBillingClient(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white">
                    <option value="">Todos los clientes</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{displayName(c)}</option>)}
                  </select>
                  <select value={billingVigency} onChange={e => setBillingVigency(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white">
                    <option value="">Cualquier vigencia</option>
                    <option value="active">Vigencia activa</option>
                    <option value="expired">Vigencia vencida</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs text-slate-400 mb-1">Total neto</div>
                  <div className="text-2xl font-semibold text-slate-700">{fmt$(totalNetoMes)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs text-slate-400 mb-1">IVA (13%)</div>
                  <div className="text-2xl font-semibold text-slate-500">{fmt$(totalIvaMes)}</div>
                </div>
                <div className="bg-blue-600 rounded-xl p-3">
                  <div className="text-xs text-blue-200 mb-1">Total con IVA</div>
                  <div className="text-2xl font-semibold text-white">{fmt$(totalConIvaMes)}</div>
                </div>
              </div>
            </div>

            {billingClients.map(c => {
              const b = getClientBilling(c)
              const pkg = PACKAGES[c.package]
              const dl = daysLeft(c.start_date)
              const end = getVigencyEnd(c.start_date)
              const depStatus = DEPOSIT_STATUS[c.deposit_status]
              const billingMonth = getCurrentBillingMonth(c)
              const pkgStatus = billingMonth?.package_status || 'pendiente'
              const extraRes = getExtraReservations(c)
              const pendingExtras = extraRes.filter(r => r.chargeStatus === 'por_cobrar').length

              return (
                <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                      {displayName(c).split(' ').map((x: string) => x[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{displayName(c)}</div>
                      {c.company_name && <div className="text-xs text-slate-400">{c.name}</div>}
                      <div className="text-xs text-slate-400">Vigencia hasta {end.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {dl}d restantes</div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-xs text-slate-400">Total con IVA</div>
                      <div className="text-xl font-semibold text-blue-600">{fmt$(b.totalConIva)}</div>
                    </div>
                  </div>

                  {/* Desglose */}
                  <div className="border border-slate-100 rounded-xl overflow-hidden mb-3">
                    <div className="grid grid-cols-5 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400 border-b border-slate-100">
                      <span className="col-span-2">Concepto</span>
                      <span className="text-right">Neto</span>
                      <span className="text-right">IVA 13%</span>
                      <span className="text-right">Total</span>
                    </div>

                    {/* Paquete con estado de pago */}
                    <div className="grid grid-cols-5 px-3 py-2.5 text-sm border-b border-slate-50 items-center">
                      <div className="col-span-2">
                        <span className="text-slate-600">Paquete {pkg.label}</span>
                        <span className="text-xs text-slate-400 block">{pkg.blocks} bloques</span>
                        <button onClick={() => togglePackageStatus(c)}
                          className={`mt-1 text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer transition-all ${pkgStatus === 'pagado' ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
                          {pkgStatus === 'pagado' ? '✓ Pagado' : '⏳ Pendiente'} — clic para cambiar
                        </button>
                      </div>
                      <span className="text-right text-slate-600">{fmt$(b.baseNeto)}</span>
                      <span className="text-right text-slate-400">{fmt$(b.baseIva)}</span>
                      <span className="text-right font-medium">{fmt$(b.baseNeto + b.baseIva)}</span>
                    </div>

                    {/* Noches extra con estado individual */}
                    {extraRes.filter(r => r.slot === 'night' && !isSunday(r.date)).length > 0 && (
                      <div className="border-b border-slate-50">
                        <div className="grid grid-cols-5 px-3 py-2 text-sm items-start">
                          <div className="col-span-2">
                            <span className="text-slate-600">Noches extra</span>
                            <span className="text-xs text-slate-400 block">{extraRes.filter(r => r.slot === 'night' && !isSunday(r.date)).length} × {fmt$(c.night_price)}</span>
                          </div>
                          <span className="text-right text-slate-600">{fmt$(b.nightNeto)}</span>
                          <span className="text-right text-slate-400">{fmt$(b.nightIva)}</span>
                          <span className="text-right font-medium">{fmt$(b.nightNeto + b.nightIva)}</span>
                        </div>
                        <div className="px-3 pb-2 space-y-1">
                          {extraRes.filter(r => r.slot === 'night' && !isSunday(r.date)).map(r => (
                            <div key={r.id} className="flex items-center gap-2 text-xs">
                              <span className="text-slate-400">{new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                              <span className="flex-1" />
                              <select
  value={r.chargeStatus}
  onChange={e => markChargeStatus(r.id, e.target.value)}
  className="text-xs border border-slate-200 rounded-lg px-2 py-0.5 bg-white cursor-pointer">
  <option value="programado">🔒 Programado</option>
  <option value="por_cobrar">⏳ Por cobrar</option>
  <option value="cobrado">✓ Cobrado</option>
</select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Domingos con estado individual */}
                    {extraRes.filter(r => isSunday(r.date)).length > 0 && (
                      <div className="border-b border-slate-50">
                        <div className="grid grid-cols-5 px-3 py-2 text-sm items-start">
                          <div className="col-span-2">
                            <span className="text-slate-600">Domingos</span>
                            <span className="text-xs text-slate-400 block">{extraRes.filter(r => isSunday(r.date)).length} × {fmt$(c.sunday_price || 25)}</span>
                          </div>
                          <span className="text-right text-slate-600">{fmt$(b.sundayNeto)}</span>
                          <span className="text-right text-slate-400">{fmt$(b.sundayIva)}</span>
                          <span className="text-right font-medium">{fmt$(b.sundayNeto + b.sundayIva)}</span>
                        </div>
                        <div className="px-3 pb-2 space-y-1">
                          {extraRes.filter(r => isSunday(r.date)).map(r => (
                            <div key={r.id} className="flex items-center gap-2 text-xs">
                              <span className="text-slate-400">{new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                              <span className="flex-1" />
                              <select
  value={r.chargeStatus}
  onChange={e => markChargeStatus(r.id, e.target.value)}
  className="text-xs border border-slate-200 rounded-lg px-2 py-0.5 bg-white cursor-pointer">
  <option value="programado">🔒 Programado</option>
  <option value="por_cobrar">⏳ Por cobrar</option>
  <option value="cobrado">✓ Cobrado</option>
</select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
{/* Bloques extra */}
{b.extraBlocks > 0 && (
  <div className="border-b border-slate-50">
    <div className="grid grid-cols-5 px-3 py-2 text-sm items-start">
      <div className="col-span-2">
        <span className="text-slate-600">Bloques extra</span>
        <span className="text-xs text-slate-400 block">{b.extraBlocks} × {fmt$(b.extraBlockPrice)}</span>
      </div>
      <span className="text-right text-slate-600">{fmt$(b.extraBlockNeto)}</span>
      <span className="text-right text-slate-400">{fmt$(b.extraBlockIva)}</span>
      <span className="text-right font-medium">{fmt$(b.extraBlockNeto + b.extraBlockIva)}</span>
    </div>
    <div className="px-3 pb-2 space-y-1">
      {billingReservations(c.id).filter(r => countsAgainstQuota(r.date, r.slot)).slice(PACKAGES[c.package].blocks).map(r => (
        <div key={r.id} className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">{new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
          <span className="flex-1" />
          <select
            value={(r as any).charge_status || 'programado'}
            onChange={e => markChargeStatus(r.id, e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-0.5 bg-white cursor-pointer">
            <option value="programado">🔒 Programado</option>
            <option value="por_cobrar">⏳ Por cobrar</option>
            <option value="cobrado">✓ Cobrado</option>
          </select>
        </div>
      ))}
    </div>
  </div>
)}
                    {/* Botón marcar todos */}
                    {pendingExtras > 0 && (
                      <div className="px-3 py-2 bg-orange-50 border-b border-slate-50 flex items-center justify-between">
                        <span className="text-xs text-orange-600">{pendingExtras} extra{pendingExtras > 1 ? 's' : ''} por cobrar</span>
                        <button onClick={() => markAllExtras(c, 'cobrado')}
                          className="text-xs bg-orange-500 text-white px-3 py-1 rounded-lg hover:bg-orange-600 transition-colors">
                          Marcar todos como cobrados
                        </button>
                      </div>
                    )}

                    {/* Total */}
                    <div className="grid grid-cols-5 px-3 py-2.5 text-sm bg-slate-50 font-semibold">
                      <span className="col-span-2 text-slate-700">Total</span>
                      <span className="text-right text-slate-700">{fmt$(b.totalNeto)}</span>
                      <span className="text-right text-slate-500">{fmt$(b.totalIva)}</span>
                      <span className="text-right text-blue-600">{fmt$(b.totalConIva)}</span>
                    </div>
                  </div>

                  {/* Depósito */}
                  {c.deposit_amount > 0 && (
                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm ${
                      c.deposit_status === 'pagado' ? 'border-green-100 bg-green-50' :
                      c.deposit_status === 'devuelto' ? 'border-blue-100 bg-blue-50' :
                      c.deposit_status === 'retenido' ? 'border-red-100 bg-red-50' :
                      'border-amber-100 bg-amber-50'
                    }`}>
                      <span className="text-lg">🔒</span>
                      <div className="flex-1">
                        <span className="font-medium">Depósito de garantía</span>
                        <span className="text-xs text-slate-500 block">
                          {c.deposit_date ? `Registrado el ${new Date(c.deposit_date + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : 'Sin fecha registrada'}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{fmt$(c.deposit_amount)}</div>
                        <span className={`text-xs font-medium ${depStatus.color} px-2 py-0.5 rounded-full`}>{depStatus.label}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} onSave={async (data) => {
        const res = await fetch('/api/clients/create', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) })
        const json = await res.json()
        if (!res.ok) { setAlert({ type: 'err', msg: json.error }); return }
        setAlert({ type: 'ok', msg: `✅ Cliente "${displayName(json)}" registrado.` })
        setShowNewClient(false); loadData()
      }} />}

      {editingClient && <EditClientModal client={editingClient} onClose={() => setEditingClient(null)} onSave={async (data) => {
        const res = await fetch('/api/clients/create', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ id: editingClient.id, ...data }) })
        const json = await res.json()
        if (!res.ok) { setAlert({ type: 'err', msg: json.error }); return }
        setAlert({ type: 'ok', msg: `✅ Cliente actualizado.` })
        setEditingClient(null); loadData()
      }} />}
{editingRes && <EditReservationModal
  reservation={editingRes}
  clients={clients}
  onClose={() => setEditingRes(null)}
  onSave={async (date, slot) => {
    const isPast = new Date(editingRes.date + 'T23:59:00') < new Date()
    if (isPast) {
      if (!confirm('⚠️ Esta reserva es del pasado. ¿Estás seguro de modificarla?')) return
    }
    await editReservation(editingRes.id, date, slot)
    setAlert({ type: 'ok', msg: `✅ Reserva actualizada.` })
    setEditingRes(null)
    loadData()
  }}
  onDelete={async () => {
    const isPast = new Date(editingRes.date + 'T23:59:00') < new Date()
    await deleteReservation(editingRes.id, isPast)
    setEditingRes(null)
  }}
/>}
      {showNewRes !== null && <NewReservationModal clients={clients} defaultDate={showNewRes.date} defaultSlot={showNewRes.slot}
        onClose={() => setShowNewRes(null)}
        onSave={async (data) => {
          const res = await fetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
          const json = await res.json()
          if (!res.ok) { setAlert({ type: 'err', msg: json.error }); setShowNewRes(null); return }
          setAlert({ type: 'ok', msg: `Reserva confirmada: ${new Date(json.date + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${SLOTS[json.slot as keyof typeof SLOTS].label}` })
          setShowNewRes(null); loadData()
        }} />}
    </div>
  )
}

function NewClientModal({ onClose, onSave }: { onClose: () => void; onSave: (d: object) => void }) {
  const today = fmtDate(new Date())
  const [form, setForm] = useState({
    name: '', company_name: '', contact: '', password: '', package: 'basic',
    start_date: today, night_price: 25, sunday_price: 25, extra_block_price: 25,
    deposit_amount: 0, deposit_status: 'pendiente', deposit_date: today,
  })
  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))
  const [copied, setCopied] = useState(false)

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const pwd = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    set('password', pwd); setCopied(false)
  }
  function copyPassword() {
    navigator.clipboard.writeText(form.password)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const suggestedDeposit = PACKAGES[form.package as keyof typeof PACKAGES].price * 0.5

  return (
    <Modal title="Registrar nuevo cliente" onClose={onClose}>
      <label className="text-xs text-slate-500">Nombre de contacto</label>
      <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 mt-1" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej. Pepito Reyes" />
      <label className="text-xs text-slate-500">Nombre fiscal / empresa <span className="text-slate-300">(opcional)</span></label>
      <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 mt-1" value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Ej. Pepitos Asociados S.A. de C.V." />
      <label className="text-xs text-slate-500">Correo electrónico</label>
      <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 mt-1" value={form.contact} onChange={e => set('contact', e.target.value)} placeholder="correo@ejemplo.com" />
      <label className="text-xs text-slate-500">Contraseña de acceso al portal</label>
      <div className="flex gap-2 mt-1 mb-1">
        <input type="text" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Escribe o genera una" />
        <button onClick={generatePassword} className="px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">Generar</button>
        {form.password && <button onClick={copyPassword} className={`px-3 py-2 text-xs rounded-lg border ${copied ? 'bg-green-50 text-green-600 border-green-200' : 'border-slate-200 hover:bg-slate-50'}`}>{copied ? '✓ Copiado' : 'Copiar'}</button>}
      </div>
      <p className="text-xs text-slate-400 mb-3">Comparte este correo y contraseña con el cliente.</p>
      <div className="grid grid-cols-2 gap-3 mb-3">
  <div>
    <label className="text-xs text-slate-500">Paquete</label>
    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={form.package} onChange={e => set('package', e.target.value)}>
      <option value="premium">🥇 Premium — 10 bloques</option>
      <option value="basic">🥈 Básico — 6 bloques</option>
      <option value="lite">🥉 Lite — 3 bloques</option>
    </select>
  </div>
  <div>
    <label className="text-xs text-slate-500">Inicio vigencia</label>
    <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
  </div>
</div>
      <div className="grid grid-cols-3 gap-3 mb-3">
  <div>
    <label className="text-xs text-slate-500">Precio noche extra ($)</label>
    <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.night_price} onChange={e => set('night_price', parseFloat(e.target.value))} />
  </div>
  <div>
    <label className="text-xs text-slate-500">Precio domingo ($)</label>
    <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.sunday_price} onChange={e => set('sunday_price', parseFloat(e.target.value))} />
  </div>
  <div>
    <label className="text-xs text-slate-500">Bloque extra ($)</label>
    <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.extra_block_price} onChange={e => set('extra_block_price', parseFloat(e.target.value))} />
  </div>
</div>
      <div className="border border-slate-100 rounded-xl p-3 mb-4 bg-slate-50">
        <p className="text-xs font-medium text-slate-600 mb-2">🔒 Depósito de garantía</p>
        <p className="text-xs text-slate-400 mb-3">50% del paquete sugerido: <strong>{fmt$(suggestedDeposit)}</strong></p>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <label className="text-xs text-slate-500">Monto ($)</label>
            <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={form.deposit_amount} onChange={e => set('deposit_amount', parseFloat(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-slate-500">Estado</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={form.deposit_status} onChange={e => set('deposit_status', e.target.value)}>
              <option value="pendiente">🟡 Pendiente</option>
              <option value="pagado">🟢 Pagado</option>
              <option value="devuelto">🔵 Devuelto</option>
              <option value="retenido">🔴 Retenido</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Fecha de pago del depósito</label>
          <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={form.deposit_date} onChange={e => set('deposit_date', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Registrar</button>
      </div>
    </Modal>
  )
}

function EditClientModal({ client, onClose, onSave }: { client: Client; onClose: () => void; onSave: (d: object) => void }) {
  const [form, setForm] = useState({
    name: client.name, company_name: client.company_name || '', contact: client.contact || '',
    password: '', package: client.package, start_date: client.start_date,
    night_price: client.night_price, sunday_price: client.sunday_price || 25, extra_block_price: (client as any).extra_block_price || 25,
    deposit_amount: client.deposit_amount || 0, deposit_status: client.deposit_status || 'pendiente',
    deposit_date: client.deposit_date || fmtDate(new Date()),
  })
  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))
  const [showPwd, setShowPwd] = useState(false)
  const [copied, setCopied] = useState(false)

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const pwd = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    set('password', pwd); setCopied(false)
  }
  function copyPassword() {
    navigator.clipboard.writeText(form.password)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal title={`Editar — ${displayName(client)}`} onClose={onClose}>
      <label className="text-xs text-slate-500">Nombre de contacto</label>
      <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 mt-1" value={form.name} onChange={e => set('name', e.target.value)} />
      <label className="text-xs text-slate-500">Nombre fiscal / empresa <span className="text-slate-300">(opcional)</span></label>
      <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 mt-1" value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Ej. Pepitos Asociados S.A. de C.V." />
      <label className="text-xs text-slate-500">Correo electrónico</label>
      <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 mt-1" value={form.contact} onChange={e => set('contact', e.target.value)} />
      <label className="text-xs text-slate-500">Nueva contraseña <span className="text-slate-300">(dejar vacío para no cambiar)</span></label>
      <div className="flex gap-2 mt-1 mb-1">
        <div className="relative flex-1">
          <input type={showPwd ? 'text' : 'password'} className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm font-mono" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
          <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showPwd ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
        <button onClick={generatePassword} className="px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">Generar</button>
        {form.password && <button onClick={copyPassword} className={`px-3 py-2 text-xs rounded-lg border ${copied ? 'bg-green-50 text-green-600 border-green-200' : 'border-slate-200 hover:bg-slate-50'}`}>{copied ? '✓ Copiado' : 'Copiar'}</button>}
      </div>
      <p className="text-xs text-slate-400 mb-3">Si generas una nueva contraseña, compártela con el cliente.</p>
      <div className="grid grid-cols-3 gap-3 mb-3">
  <div>
    <label className="text-xs text-slate-500">Precio noche extra ($)</label>
    <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.night_price} onChange={e => set('night_price', parseFloat(e.target.value))} />
  </div>
  <div>
    <label className="text-xs text-slate-500">Precio domingo ($)</label>
    <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.sunday_price} onChange={e => set('sunday_price', parseFloat(e.target.value))} />
  </div>
  <div>
    <label className="text-xs text-slate-500">Bloque extra ($)</label>
    <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.extra_block_price} onChange={e => set('extra_block_price', parseFloat(e.target.value))} />
  </div>
</div>
      <div className="border border-slate-100 rounded-xl p-3 mb-4 bg-slate-50">
        <p className="text-xs font-medium text-slate-600 mb-3">🔒 Depósito de garantía</p>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <label className="text-xs text-slate-500">Monto ($)</label>
            <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={form.deposit_amount} onChange={e => set('deposit_amount', parseFloat(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-slate-500">Estado</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={form.deposit_status} onChange={e => set('deposit_status', e.target.value)}>
              <option value="pendiente">🟡 Pendiente</option>
              <option value="pagado">🟢 Pagado</option>
              <option value="devuelto">🔵 Devuelto</option>
              <option value="retenido">🔴 Retenido</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Fecha de pago del depósito</label>
          <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={form.deposit_date} onChange={e => set('deposit_date', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar cambios</button>
      </div>
    </Modal>
  )
}

function NewReservationModal({ clients, defaultDate, defaultSlot, onClose, onSave }:
  { clients: Client[]; defaultDate?: string; defaultSlot?: string; onClose: () => void; onSave: (d: object) => void }) {
  const today = fmtDate(new Date())
  const [form, setForm] = useState({ client_id: clients[0]?.id || '', date: defaultDate || today, slot: defaultSlot || 'morning' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const isSelectedSunday = form.date ? isSunday(form.date) : false
  return (
    <Modal title="Nueva reserva" onClose={onClose}>
      <label className="text-xs text-slate-500">Cliente</label>
      <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 mb-3 bg-white" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
        {clients.map(c => <option key={c.id} value={c.id}>{displayName(c)}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-slate-500">Fecha</label>
          <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.date} min={today} onChange={e => set('date', e.target.value)} />
          {form.date && <div className="text-xs text-slate-400 mt-1">
            {new Date(form.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>}
        </div>
        <div>
          <label className="text-xs text-slate-500">Turno</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={form.slot} onChange={e => set('slot', e.target.value)}>
            <option value="morning">☀️ Mañana (7am–12pm)</option>
            <option value="afternoon">🌤️ Tarde (1pm–5pm)</option>
            <option value="night">🌙 Noche extra (6pm–9pm)</option>
          </select>
        </div>
      </div>
      {isSelectedSunday && (
        <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2 mb-3">
          🗓️ Domingo — se cobrará el precio extra configurado para este cliente.
        </p>
      )}
      <div className="flex gap-2 justify-end mt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Confirmar</button>
      </div>
    </Modal>
  )
}
function EditReservationModal({ reservation, clients, onClose, onSave, onDelete }:
  { reservation: Reservation; clients: Client[]; onClose: () => void; onSave: (date: string, slot: 'morning' | 'afternoon' | 'night') => void; onDelete: () => void }) {
  const isPast = new Date(reservation.date + 'T23:59:00') < new Date()
  const client = clients.find(c => c.id === reservation.client_id)
  const [date, setDate] = useState(reservation.date)
  const [slot, setSlot] = useState<'morning' | 'afternoon' | 'night'>(reservation.slot)
  return (
    <Modal title="Editar reserva" onClose={onClose}>
      {isPast && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl p-3 mb-4">
          ⚠️ Esta reserva es del pasado. Cualquier cambio o eliminación afectará el historial.
        </div>
      )}
      <div className="text-sm text-slate-500 mb-4">
        Cliente: <span className="font-medium text-slate-700">{client ? displayName(client) : '?'}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label className="text-xs text-slate-500">Fecha</label>
          <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={date} onChange={e => setDate(e.target.value)} />
          {date && <div className="text-xs text-slate-400 mt-1">
            {new Date(date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>}
        </div>
        <div>
          <label className="text-xs text-slate-500">Turno</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" value={slot} onChange={e => setSlot(e.target.value as 'morning' | 'afternoon' | 'night')}>
            <option value="morning">☀️ Mañana (7am–12pm)</option>
            <option value="afternoon">🌤️ Tarde (1pm–5pm)</option>
            <option value="night">🌙 Noche extra (6pm–9pm)</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-between">
        <button onClick={onDelete} className="px-4 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
          Eliminar
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
          <button onClick={() => onSave(date, slot)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar</button>
        </div>
      </div>
    </Modal>
  )
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md border border-slate-200 max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
