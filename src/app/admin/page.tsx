'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Client, Reservation, PACKAGES, SLOTS, fmtDate, daysLeft, getVigencyEnd, fmtDisplay, ADMIN_EMAIL, isSunday, countsAgainstQuota, displayName } from '@/lib/supabase'

const ADMIN_SECRET = 'Modular2024!'
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_ES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function authHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_SECRET }
}

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'calendar' | 'clients' | 'reservations'>('calendar')
  const [calView, setCalView] = useState<'week' | 'month'>('week')
  const [clients, setClients] = useState<Client[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showNewClient, setShowNewClient] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [showNewRes, setShowNewRes] = useState<{ date?: string; slot?: string } | null>(null)
  const [filterClient, setFilterClient] = useState('')
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
    const [cRes, rRes] = await Promise.all([fetch('/api/clients'), fetch('/api/reservations')])
    setClients(await cRes.json())
    setReservations(await rRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function getWeekDays() {
    const today = new Date()
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - dow + weekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return d
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
  const todayStr = fmtDate(new Date())

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

  async function deleteReservation(id: string) {
    if (!confirm('¿Cancelar esta reserva?')) return
    await fetch(`/api/reservations/${id}`, { method: 'DELETE', headers: authHeaders() })
    loadData()
  }

  async function deleteClient(id: string) {
    if (!confirm('¿Eliminar cliente y todas sus reservas?')) return
    await fetch(`/api/clients/${id}`, { method: 'DELETE', headers: authHeaders() })
    loadData()
  }

  const slotColors: Record<string, string> = {
    morning:   'bg-blue-50 border-blue-300 text-blue-800',
    afternoon: 'bg-green-50 border-green-300 text-green-800',
    night:     'bg-amber-50 border-amber-300 text-amber-800',
  }

  const slotDots: Record<string, string> = {
    morning: 'bg-blue-400',
    afternoon: 'bg-green-400',
    night: 'bg-amber-400',
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando datos…</div>

  const { ref: monthRef, firstDay, daysInMonth } = getMonthDays()

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="font-semibold text-slate-800 mr-auto" style={{ fontFamily: 'Fraunces, serif' }}>Modulare Flex Office</span>
        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Admin</span>
        {(['calendar', 'clients', 'reservations'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-sm px-3 py-1.5 rounded-lg transition-all ${tab === t ? 'bg-slate-100 font-medium' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'calendar' ? '📅 Calendario' : t === 'clients' ? '👥 Clientes' : '📋 Reservas'}
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
        {tab === 'calendar' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <h2 className="font-semibold text-slate-700 mr-auto">
                {calView === 'week'
                  ? `${weekDays[0].toLocaleDateString('es-SV', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : `${MONTHS_ES[monthRef.getMonth()]} ${monthRef.getFullYear()}`
                }
              </h2>
              <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
                <button onClick={() => setCalView('week')}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all ${calView === 'week' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>
                  Semana
                </button>
                <button onClick={() => setCalView('month')}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all ${calView === 'month' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>
                  Mes
                </button>
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
                            onClick={() => res ? deleteReservation(res.id) : setShowNewRes({ date: dateStr, slot })}
                            className={`min-h-12 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center text-center p-1
                              ${res ? slotColors[slot] : isDom ? 'border-purple-100 bg-purple-50 hover:border-purple-300' : 'border-slate-100 bg-slate-50 hover:border-blue-300 hover:bg-blue-50'}`}
                            title={res ? `${client ? displayName(client) : ''} — clic para cancelar` : isDom ? 'Domingo (extra)' : 'Clic para reservar'}>
                            {client
                              ? <span className="text-xs font-medium leading-tight">{displayName(client).split(' ')[0]}</span>
                              : <span className={`text-lg ${isDom ? 'text-purple-200' : 'text-slate-200'}`}>+</span>
                            }
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
                      <div key={dateStr}
                        onClick={() => setShowNewRes({ date: dateStr })}
                        className={`min-h-16 rounded-xl border p-1.5 transition-all cursor-pointer
                          ${isToday ? 'border-blue-300 bg-blue-50' : isDom ? 'border-purple-100 bg-purple-50 hover:border-purple-300' : 'border-slate-100 hover:border-slate-300'}`}>
                        <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-blue-600' : isDom ? 'text-purple-500' : 'text-slate-500'}`}>{day}</div>
                        <div className="flex flex-col gap-0.5">
                          {dayRes.map(r => {
                            const c = clients.find(x => x.id === r.client_id)
                            return (
                              <div key={r.id}
                                onClick={e => { e.stopPropagation(); deleteReservation(r.id) }}
                                className={`flex items-center gap-1 px-1 py-0.5 rounded text-xs cursor-pointer hover:opacity-75
                                  ${r.slot === 'morning' ? 'bg-blue-100 text-blue-700' : r.slot === 'afternoon' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                                title={`${c ? displayName(c) : ''} · ${SLOTS[r.slot as keyof typeof SLOTS].label} — clic para cancelar`}>
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

        {tab === 'clients' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h2 className="font-semibold text-slate-700 mb-4">Clientes registrados</h2>
            {clients.length === 0 && <p className="text-slate-400 text-sm text-center py-8">Sin clientes. Agrega uno con "+ Cliente"</p>}
            <div className="space-y-3">
              {clients.map(c => {
                const { used, nights, sundays, total, remaining } = getClientUsage(c)
                const pct = Math.round((used / total) * 100)
                const dl = daysLeft(c.start_date)
                const end = getVigencyEnd(c.start_date)
                const nightCost = nights * c.night_price
                const sundayCost = sundays * (c.sunday_price || 25)
                const pkg = PACKAGES[c.package]
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
                        {dl <= 5 && <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">⚠️ {dl}d restantes</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {used}/{total} bloques · vence {end.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {nights > 0 && ` · ${nights} noches ($${nightCost})`}
                        {sundays > 0 && ` · ${sundays} domingos ($${sundayCost})`}
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
                          {isDom && <span className="ml-1 text-xs text-purple-600">🗓️ dom +${c?.sunday_price || 25}</span>}
                          {r.slot === 'night' && !isDom && <span className="ml-2 text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">+${c?.night_price}/noche</span>}
                        </div>
                        <button onClick={() => deleteReservation(r.id)} className="text-xs text-slate-300 hover:text-red-400">✕</button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} onSave={async (data) => {
        const res = await fetch('/api/clients/create', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) })
        const json = await res.json()
        if (!res.ok) { setAlert({ type: 'err', msg: json.error }); return }
        setAlert({ type: 'ok', msg: `✅ Cliente "${displayName(json)}" registrado. Ya puede ingresar al portal.` })
        setShowNewClient(false); loadData()
      }} />}

      {editingClient && <EditClientModal client={editingClient} onClose={() => setEditingClient(null)} onSave={async (data) => {
        const res = await fetch('/api/clients/create', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ id: editingClient.id, ...data }) })
        const json = await res.json()
        if (!res.ok) { setAlert({ type: 'err', msg: json.error }); return }
        setAlert({ type: 'ok', msg: `✅ Cliente "${displayName(json)}" actualizado.` })
        setEditingClient(null); loadData()
      }} />}

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
  const [form, setForm] = useState({ name: '', company_name: '', contact: '', password: '', package: 'basic', start_date: today, night_price: 25, sunday_price: 25 })
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
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-slate-500">Precio noche extra ($)</label>
          <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.night_price} onChange={e => set('night_price', parseFloat(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Precio domingo ($)</label>
          <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.sunday_price} onChange={e => set('sunday_price', parseFloat(e.target.value))} />
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
    name: client.name,
    company_name: client.company_name || '',
    contact: client.contact || '',
    password: '',
    package: client.package,
    start_date: client.start_date,
    night_price: client.night_price,
    sunday_price: client.sunday_price || 25,
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
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-slate-500">Precio noche extra ($)</label>
          <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.night_price} onChange={e => set('night_price', parseFloat(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Precio domingo ($)</label>
          <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.sunday_price} onChange={e => set('sunday_price', parseFloat(e.target.value))} />
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
          🗓️ Domingo — se cobrará el precio extra de domingo configurado para este cliente.
        </p>
      )}
      <div className="flex gap-2 justify-end mt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Confirmar</button>
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
