'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Client, Reservation, PACKAGES, SLOTS, fmtDate, daysLeft, getVigencyEnd, ADMIN_EMAIL, isSunday, countsAgainstQuota, displayName, fmt$, DEPOSIT_STATUS } from '@/lib/supabase'

const IVA = 0.13
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function PortalPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [allReservations, setAllReservations] = useState<Reservation[]>([])
  const [billingMonth, setBillingMonth] = useState<any>(null)
  const [contract, setContract] = useState<any>(null)
  const [selectedContractMonth, setSelectedContractMonth] = useState<number>(1)
  const [date, setDate] = useState(fmtDate(new Date()))
  const [slot, setSlot] = useState('morning')
  const [alert, setAlert] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [portalTab, setPortalTab] = useState<'reservas' | 'calendario' | 'facturacion'>('reservas')
  const [calMonthOffset, setCalMonthOffset] = useState(0)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (user.email === ADMIN_EMAIL) { router.push('/admin'); return }
      const { data: byUserId } = await supabase.from('clients').select('*').eq('auth_user_id', user.id).single()
      if (byUserId) {
        setClient(byUserId)
        loadClientData(byUserId.id)
      } else {
        const { data: byEmail } = await supabase.from('clients').select('*').eq('contact', user.email).single()
        if (byEmail) { setClient(byEmail); loadClientData(byEmail.id) }
      }
      setLoading(false)
    }
    init()
  }, [router])

  async function loadClientData(clientId: string) {
    const [resRes, allResRes, billRes, conRes] = await Promise.all([
      fetch(`/api/reservations?client_id=${clientId}`),
      fetch(`/api/reservations`),
      fetch(`/api/billing?client_id=${clientId}`),
      fetch(`/api/contracts?client_id=${clientId}`),
    ])
    setReservations(await resRes.json())
    setAllReservations(await allResRes.json())
    const bills = await billRes.json()
    if (bills.length > 0) setBillingMonth(bills[0])
    const cons = await conRes.json()
    if (cons.length > 0) {
      const activeContract = cons.find((c: any) => c.status === 'active')
      if (activeContract) {
        setContract(activeContract)
        const today = new Date()
        const currentMonth =
          today >= new Date(activeContract.month1_start) && today <= new Date(activeContract.month1_end + 'T23:59:59') ? 1 :
          today >= new Date(activeContract.month2_start) && today <= new Date(activeContract.month2_end + 'T23:59:59') ? 2 :
          today >= new Date(activeContract.month3_start) && today <= new Date(activeContract.month3_end + 'T23:59:59') ? 3 : 1
        setSelectedContractMonth(currentMonth)
      }
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function makeReservation() {
    if (!client) return
    setSaving(true); setAlert(null)
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: client.id, date, slot, is_extra: isExtraBlock }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setAlert({ type: 'err', msg: json.error }); return }
    setAlert({ type: 'ok', msg: `✅ Reserva confirmada: ${new Date(json.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} · ${SLOTS[json.slot as keyof typeof SLOTS].label}` })
    loadClientData(client.id)
  }

  async function cancelReservation(id: string, date: string) {
    const resDate = new Date(date + 'T00:00:00')
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((resDate.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 2) {
      setAlert({ type: 'err', msg: '⚠️ No puedes cancelar una reserva con 2 días o menos de anticipación. Contacta al administrador.' })
      return
    }
    if (!confirm('¿Cancelar esta reserva?')) return
    await fetch(`/api/reservations/${id}`, { method: 'DELETE' })
    setReservations(prev => prev.filter(r => r.id !== id))
    setAllReservations(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Cargando…</div>

  if (!client) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="font-semibold text-slate-700 mb-2">Cuenta no vinculada</h2>
        <p className="text-slate-400 text-sm mb-4">Contacta al administrador.</p>
        <button onClick={logout} className="text-sm text-blue-600 hover:underline">Cerrar sesión</button>
      </div>
    </div>
  )

  // Filtrar reservas por mes del contrato seleccionado
  const monthReservations = contract ? reservations.filter(r => {
    const rd = new Date(r.date + 'T12:00:00')
    const mStart = new Date(contract[`month${selectedContractMonth}_start`] + 'T00:00:00')
    const mEnd = new Date(contract[`month${selectedContractMonth}_end`] + 'T23:59:59')
    return rd >= mStart && rd <= mEnd
  }) : reservations

  const usedQuota = monthReservations.filter(r => countsAgainstQuota(r.date, r.slot)).length
  const nights = monthReservations.filter(r => r.slot === 'night' && !isSunday(r.date)).length
  const sundays = monthReservations.filter(r => isSunday(r.date)).length
  const total = PACKAGES[client.package].blocks
  const remaining = Math.max(0, total - usedQuota)
  const extraBlocks = monthReservations.filter(r => countsAgainstQuota(r.date, r.slot)).length - total
  const extraBlocksCount = extraBlocks > 0 ? extraBlocks : 0
  const pct = Math.round((Math.min(usedQuota, total) / total) * 100)
  const dl = daysLeft(client.start_date)
  const end = getVigencyEnd(client.start_date)
  const pkg = PACKAGES[client.package]
  const extraBlockPrice = (client as any).extra_block_price || 25
  const baseNeto = pkg.price
  const nightNeto = nights * client.night_price
  const sundayNeto = sundays * (client.sunday_price || 25)
  const extraBlockNeto = extraBlocksCount * extraBlockPrice
  const totalNeto = baseNeto + nightNeto + sundayNeto + extraBlockNeto
  const baseIva = baseNeto * IVA
  const nightIva = nightNeto * IVA
  const sundayIva = sundayNeto * IVA
  const totalIva = totalNeto * IVA
  const totalConIva = totalNeto * (1 + IVA)
  const depStatus = client.deposit_status ? DEPOSIT_STATUS[client.deposit_status] : null

  // Estado de pago del mes seleccionado
  const selectedMonthStart = contract ? contract[`month${selectedContractMonth}_start`] : null

  const extraReservations = monthReservations
    .filter(r => r.slot === 'night' || isSunday(r.date))
    .map(r => ({ ...r, chargeStatus: (r as any).charge_status || 'programado' }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const isSelectedSunday = isSunday(date)
  const isSelectedNight = slot === 'night'
  const isExtraBlock = !isSelectedSunday && !isSelectedNight && remaining <= 0 && (slot === 'morning' || slot === 'afternoon') && !isSunday(date)
  const canBook = isSelectedSunday || isSelectedNight || remaining > 0 || isExtraBlock

  // Mes actual del contrato
  const today2 = new Date()
  const currentContractMonth = contract ? (
    today2 >= new Date(contract.month1_start) && today2 <= new Date(contract.month1_end + 'T23:59:59') ? 1 :
    today2 >= new Date(contract.month2_start) && today2 <= new Date(contract.month2_end + 'T23:59:59') ? 2 :
    today2 >= new Date(contract.month3_start) && today2 <= new Date(contract.month3_end + 'T23:59:59') ? 3 : null
  ) : null

  function chargeStatusLabel(status: string) {
    if (status === 'cobrado') return { label: '✓ Cobrado', color: 'bg-green-50 text-green-600' }
    if (status === 'por_cobrar') return { label: '⏳ Por cobrar', color: 'bg-orange-50 text-orange-600' }
    return { label: '🔒 Programado', color: 'bg-slate-100 text-slate-500' }
  }

  // Calendar
  const today = new Date()
  const calRef = new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1)
  const calFirstDay = calRef.getDay()
  const calDaysInMonth = new Date(calRef.getFullYear(), calRef.getMonth() + 1, 0).getDate()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  function getDateStr(day: number) {
    return `${calRef.getFullYear()}-${String(calRef.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }

  function getDayReservations(dateStr: string) {
    const mine = reservations.filter(r => r.date === dateStr)
    const others = allReservations.filter(r => r.date === dateStr && r.client_id !== client!.id)
    return { mine, others }
  }

  const slotDot: Record<string, string> = {
    morning: 'bg-blue-400',
    afternoon: 'bg-green-400',
    night: 'bg-amber-400',
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-3">
          <img src="/Logo%20M%20Negro.png" alt="Modulare" className="w-10 h-10 object-contain" />
          <span className="text-xl font-semibold text-slate-800" style={{ fontFamily: 'Fraunces, serif' }}>Modulare Flex Office</span>
        </div>
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full ml-auto">Portal de clientes</span>
        <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">Salir</button>
      </nav>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
              {displayName(client).split(' ').map((x: string) => x[0]).slice(0, 2).join('')}
            </div>
            <div className="flex-1">
              <div className="font-semibold">{displayName(client)}</div>
              {client.company_name && <div className="text-xs text-slate-400">{client.name}</div>}
              <div className="text-xs text-slate-400">Paquete {pkg.label} · {fmt$(pkg.price)}+IVA/mes</div>
              {contract && <div className="text-xs text-slate-500 font-medium mt-0.5">{contract.contract_number}</div>}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${dl <= 5 ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
              {dl}d restantes<br/><span className="text-xs font-normal">periodo en curso</span>
            </span>
          </div>

          {/* Selector de mes del contrato */}
          {contract && (
            <div className="mb-3">
              <div className="flex gap-1 mb-1">
                {[1,2,3].map(m => {
                  const mStart = new Date(contract[`month${m}_start`] + 'T00:00:00')
                  const mEnd = new Date(contract[`month${m}_end`] + 'T23:59:59')
                  const isCurrentM = new Date() >= mStart && new Date() <= mEnd
                  const isSelected = selectedContractMonth === m
                  return (
                    <button key={m} onClick={() => setSelectedContractMonth(m)}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-all ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 hover:border-blue-300'}`}>
                      Mes {m}/3 {isCurrentM ? '●' : ''}
                    </button>
                  )
                })}
              </div>
              <div className="text-xs text-slate-400">
                {new Date(contract[`month${selectedContractMonth}_start`] + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })} → {new Date(contract[`month${selectedContractMonth}_end`] + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-5 gap-2">
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Usados</div><div className="text-xl font-semibold">{Math.min(usedQuota, total)}/{total}</div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Disponibles</div><div className={`text-xl font-semibold ${remaining === 0 ? 'text-red-500' : remaining <= 1 ? 'text-amber-500' : 'text-green-600'}`}>{remaining}</div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Noches</div><div className="text-xl font-semibold">{nights}</div>{nights > 0 && <div className="text-xs text-amber-600">{fmt$(nightNeto)}</div>}</div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Domingos</div><div className="text-xl font-semibold">{sundays}</div>{sundays > 0 && <div className="text-xs text-purple-600">{fmt$(sundayNeto)}</div>}</div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Extras</div><div className={`text-xl font-semibold ${extraBlocksCount > 0 ? 'text-blue-600' : ''}`}>{extraBlocksCount}</div>{extraBlocksCount > 0 && <div className="text-xs text-blue-600">{fmt$(extraBlocksCount * extraBlockPrice)}</div>}</div>
          </div>
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-slate-400 mt-2">Vigencia hasta {end.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          <button onClick={() => setPortalTab('reservas')} className={`flex-1 text-sm py-2 rounded-lg transition-all ${portalTab === 'reservas' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>📅 Reservas</button>
          <button onClick={() => setPortalTab('calendario')} className={`flex-1 text-sm py-2 rounded-lg transition-all ${portalTab === 'calendario' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>📆 Calendario</button>
          <button onClick={() => setPortalTab('facturacion')} className={`flex-1 text-sm py-2 rounded-lg transition-all ${portalTab === 'facturacion' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>💰 Facturación</button>
        </div>

        {/* ── RESERVAS ── */}
        {portalTab === 'reservas' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-700 mb-3">Reservar un bloque</h3>
              {alert && <div className={`text-sm rounded-xl p-3 mb-3 ${alert.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{alert.msg}</div>}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Fecha</label>
                  <input type="date" min={fmtDate(new Date())} value={date} onChange={e => setDate(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                  {date && <div className="text-xs text-slate-400 mt-1">{new Date(date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>}
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Turno</label>
                  <select value={slot} onChange={e => setSlot(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
                    <option value="morning">☀️ Mañana (7am–12pm)</option>
                    <option value="afternoon">🌤️ Tarde (1pm–5pm)</option>
                    <option value="night">🌙 Noche extra (6pm–9pm)</option>
                  </select>
                </div>
              </div>
              {isSelectedSunday && !isSelectedNight && <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2 mb-3">Domingo: costo extra de <strong>{fmt$(client.sunday_price || 25)}</strong> por bloque.</p>}
              {isSelectedNight && !isSelectedSunday && <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mb-3">Noche extra: costo de <strong>{fmt$(client.night_price)}</strong> por bloque.</p>}
              {isSelectedSunday && isSelectedNight && <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2 mb-3">Domingo nocturno: costo extra de <strong>{fmt$(client.sunday_price || 25)}</strong> por bloque.</p>}
              {isExtraBlock && <p className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2 mb-3">Paquete agotado: se aplicará cargo extra de <strong>{fmt$(extraBlockPrice)}</strong> por este bloque adicional.</p>}
              <button onClick={makeReservation} disabled={saving || !canBook} className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving ? 'Confirmando…' : '📅 Confirmar reserva'}
              </button>
              {!canBook && <p className="text-xs text-red-500 text-center mt-2">No tienes bloques disponibles en tu paquete actual.</p>}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-700 mb-3">Mis reservas</h3>
              {reservations.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Sin reservas activas</p>}
              <div className="space-y-2">
                {reservations.filter(r => {
  if (!contract) return true
  const rd = new Date(r.date + 'T12:00:00')
  const mStart = new Date(contract[`month${selectedContractMonth}_start`] + 'T00:00:00')
  const mEnd = new Date(contract[`month${selectedContractMonth}_end`] + 'T23:59:59')
  return rd >= mStart && rd <= mEnd
}).sort((a, b) => a.date.localeCompare(b.date)).map(r => {
                  const slotInfo = SLOTS[r.slot as keyof typeof SLOTS]
                  const isPast = new Date(r.date + 'T23:59:00') < new Date()
                  const isDom = isSunday(r.date)
                  const isExtraBlockRes = !isDom && r.slot !== 'night' && countsAgainstQuota(r.date, r.slot) && reservations.filter(rx => countsAgainstQuota(rx.date, rx.slot)).indexOf(r) >= total
                  const extraCost = isDom ? (client.sunday_price || 25) : r.slot === 'night' ? client.night_price : isExtraBlockRes ? extraBlockPrice : 0
                  return (
                    <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 ${isPast ? 'opacity-50' : ''}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.slot === 'morning' ? 'bg-blue-400' : r.slot === 'afternoon' ? 'bg-green-400' : 'bg-amber-400'}`} />
                      <div className="flex-1 text-sm">
                        <span className="font-medium">{new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                        <span className="text-slate-400"> · {slotInfo.label}</span>
                        {contract && (() => {
  const rd = new Date(r.date + 'T12:00:00')
  for (const m of [1,2,3]) {
    const ms = new Date(contract[`month${m}_start`] + 'T00:00:00')
    const me = new Date(contract[`month${m}_end`] + 'T23:59:59')
    if (rd >= ms && rd <= me) {
      const colors = ['bg-blue-50 text-blue-600', 'bg-green-50 text-green-600', 'bg-purple-50 text-purple-600']
      return <span className={`ml-1 text-xs px-1.5 py-0.5 rounded font-medium ${colors[m-1]}`}>0{m}/3</span>
    }
  }
  return null
})()}
                        {isDom && <span className="ml-1 text-xs text-purple-600">· dom</span>}
                        {extraCost > 0 && <span className="ml-2 text-xs text-amber-600">+{fmt$(extraCost)}</span>}
                        {isPast && <span className="ml-2 text-xs text-slate-300">pasado</span>}
                      </div>
                      {!isPast && <button onClick={() => cancelReservation(r.id, r.date)} className="text-xs text-slate-300 hover:text-red-400">✕</button>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── CALENDARIO ── */}
        {portalTab === 'calendario' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-slate-700 mr-auto">
                {MONTHS_ES[calRef.getMonth()]} {calRef.getFullYear()}
              </h3>
              <button onClick={() => setCalMonthOffset(o => o - 1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">‹</button>
              <button onClick={() => setCalMonthOffset(0)} className="text-xs px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-400">Hoy</button>
              <button onClick={() => setCalMonthOffset(o => o + 1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">›</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DAYS_SHORT.map((d, i) => (
                <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? 'text-purple-400' : 'text-slate-400'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: calFirstDay }).map((_, i) => <div key={'e-' + i} />)}
              {Array.from({ length: calDaysInMonth }).map((_, i) => {
                const day = i + 1
                const dateStr = getDateStr(day)
                const { mine, others } = getDayReservations(dateStr)
                const isToday = dateStr === todayStr
                const isDom = new Date(dateStr + 'T12:00:00').getDay() === 0
                return (
                  <div key={dateStr} className={`rounded-lg p-1 min-h-12 flex flex-col ${isToday ? 'bg-blue-50 border border-blue-200' : isDom ? 'bg-purple-50' : 'bg-slate-50'}`}>
                    <span className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-blue-600' : isDom ? 'text-purple-500' : 'text-slate-500'}`}>{day}</span>
                    <div className="flex flex-col gap-0.5">
                      {mine.map(r => (
                        <div key={r.id} className={`w-full h-2 rounded-full ${slotDot[r.slot]}`} title={SLOTS[r.slot as keyof typeof SLOTS].label} />
                      ))}
                      {others.map((r, i) => (
                        <div key={i} className="w-full h-2 rounded-full bg-slate-300 flex items-center">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.slot === 'morning' ? 'bg-blue-400' : r.slot === 'afternoon' ? 'bg-green-400' : 'bg-amber-400'}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-4 text-xs text-slate-400">
              <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />Mañana (tuyo)</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />Tarde (tuyo)</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Noche (tuyo)</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-slate-300 mr-1" />Ocupado por otro</span>
            </div>
          </div>
        )}

        {/* ── FACTURACIÓN ── */}
        {portalTab === 'facturacion' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="mb-4">
              <h3 className="font-semibold text-slate-700">Resumen de facturación</h3>
              {contract && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3].map(m => {
                      const isCurrentM = currentContractMonth === m
                      const isSelected = selectedContractMonth === m
                      return (
                        <button key={m} onClick={() => setSelectedContractMonth(m)}
                          className={`text-xs px-2 py-0.5 rounded-full border transition-all ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 hover:border-blue-300'}`}>
                          Mes {m}/3 {isCurrentM ? '●' : ''}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-slate-400">
                    {new Date(contract[`month${selectedContractMonth}_start`] + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })} → {new Date(contract[`month${selectedContractMonth}_end`] + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                </div>
              )}
              {!contract && <p className="text-xs text-slate-400 mt-0.5">Mes en curso · IVA 13%</p>}
            </div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Neto</div><div className="text-lg font-semibold text-slate-700">{fmt$(totalNeto)}</div></div>
              <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">IVA 13%</div><div className="text-lg font-semibold text-slate-500">{fmt$(totalIva)}</div></div>
              <div className="bg-blue-600 rounded-xl p-3"><div className="text-xs text-blue-200 mb-1">Total</div><div className="text-lg font-semibold text-white">{fmt$(totalConIva)}</div></div>
            </div>
            <div className="border border-slate-100 rounded-xl overflow-hidden mb-4">
              <div className="grid grid-cols-4 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400 border-b border-slate-100">
                <span>Concepto</span><span className="text-right">Neto</span><span className="text-right">IVA</span><span className="text-right">Total</span>
              </div>
              <div className="px-3 py-2.5 text-sm border-b border-slate-50">
                <div className="grid grid-cols-4 items-start">
                  <div>
                    <span className="text-slate-600">Paquete {pkg.label}</span>
                    <span className="text-xs text-slate-400 block">{pkg.blocks} bloques</span>
                  </div>
                  <span className="text-right text-slate-600">{fmt$(baseNeto)}</span>
                  <span className="text-right text-slate-400">{fmt$(baseIva)}</span>
                  <span className="text-right font-medium">{fmt$(baseNeto + baseIva)}</span>
                </div>
              </div>
              {extraReservations.filter(r => r.slot === 'night' && !isSunday(r.date)).length > 0 && (
                <div className="border-b border-slate-50">
                  <div className="grid grid-cols-4 px-3 py-2 text-sm items-start">
                    <div><span className="text-slate-600">Noches extra</span><span className="text-xs text-slate-400 block">{extraReservations.filter(r => r.slot === 'night' && !isSunday(r.date)).length} × {fmt$(client.night_price)}</span></div>
                    <span className="text-right text-slate-600">{fmt$(nightNeto)}</span>
                    <span className="text-right text-slate-400">{fmt$(nightIva)}</span>
                    <span className="text-right font-medium">{fmt$(nightNeto + nightIva)}</span>
                  </div>
                  <div className="px-3 pb-2 space-y-1">
                    {extraReservations.filter(r => r.slot === 'night' && !isSunday(r.date)).map(r => {
                      const cs = chargeStatusLabel(r.chargeStatus)
                      return (
                        <div key={r.id} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400">{new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                          <span className="flex-1" />
                          <span className={`px-2 py-0.5 rounded-full font-medium ${cs.color}`}>{cs.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {extraReservations.filter(r => isSunday(r.date)).length > 0 && (
                <div className="border-b border-slate-50">
                  <div className="grid grid-cols-4 px-3 py-2 text-sm items-start">
                    <div><span className="text-slate-600">Domingos</span><span className="text-xs text-slate-400 block">{extraReservations.filter(r => isSunday(r.date)).length} × {fmt$(client.sunday_price || 25)}</span></div>
                    <span className="text-right text-slate-600">{fmt$(sundayNeto)}</span>
                    <span className="text-right text-slate-400">{fmt$(sundayIva)}</span>
                    <span className="text-right font-medium">{fmt$(sundayNeto + sundayIva)}</span>
                  </div>
                  <div className="px-3 pb-2 space-y-1">
                    {extraReservations.filter(r => isSunday(r.date)).map(r => {
                      const cs = chargeStatusLabel(r.chargeStatus)
                      return (
                        <div key={r.id} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400">{new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                          <span className="flex-1" />
                          <span className={`px-2 py-0.5 rounded-full font-medium ${cs.color}`}>{cs.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {extraBlocksCount > 0 && (
                <div className="border-b border-slate-50">
                  <div className="grid grid-cols-4 px-3 py-2 text-sm items-start">
                    <div><span className="text-slate-600">Bloques extra</span><span className="text-xs text-slate-400 block">{extraBlocksCount} × {fmt$(extraBlockPrice)}</span></div>
                    <span className="text-right text-slate-600">{fmt$(extraBlockNeto)}</span>
                    <span className="text-right text-slate-400">{fmt$(extraBlockNeto * 0.13)}</span>
                    <span className="text-right font-medium">{fmt$(extraBlockNeto * 1.13)}</span>
                  </div>
                  <div className="px-3 pb-2 space-y-1">
                    {monthReservations.filter(r => countsAgainstQuota(r.date, r.slot)).slice(total).map(r => {
                      const cs = chargeStatusLabel((r as any).charge_status || 'programado')
                      return (
                        <div key={r.id} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400">{new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                          <span className="flex-1" />
                          <span className={`px-2 py-0.5 rounded-full font-medium ${cs.color}`}>{cs.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-4 px-3 py-2.5 text-sm bg-slate-50 font-semibold">
                <span className="text-slate-700">Total mes</span>
                <span className="text-right text-slate-700">{fmt$(totalNeto)}</span>
                <span className="text-right text-slate-500">{fmt$(totalIva)}</span>
                <span className="text-right text-blue-600">{fmt$(totalConIva)}</span>
              </div>
            </div>
            {client.deposit_amount > 0 && depStatus && (
              <div className={`rounded-xl border p-3 ${client.deposit_status === 'pagado' ? 'border-green-100 bg-green-50' : client.deposit_status === 'devuelto' ? 'border-blue-100 bg-blue-50' : client.deposit_status === 'retenido' ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔒</span>
                  <div className="flex-1">
                    <div className="font-medium text-sm">Depósito de garantía</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {client.deposit_status === 'pendiente' && 'Pendiente de pago — comunícate con tu administrador.'}
                      {client.deposit_status === 'pagado' && `Pagado el ${client.deposit_date ? new Date(client.deposit_date + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'} · Se devuelve al finalizar el contrato mínimo de 3 meses.`}
                      {client.deposit_status === 'devuelto' && 'Depósito devuelto. ¡Gracias por tu estadía!'}
                      {client.deposit_status === 'retenido' && 'Depósito retenido por no cumplir el contrato mínimo de 3 meses.'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm">{fmt$(client.deposit_amount)}</div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${depStatus.color}`}>{depStatus.label}</span>
                  </div>
                </div>
              </div>
            )}
            <p className="text-xs text-slate-300 text-center mt-4">Este resumen es informativo. Tu administrador emitirá la factura oficial.</p>
          </div>
        )}

      </div>
    </div>
  )
}
