'use client'
import { useEffect, useState } from 'react'
import { Client, Reservation, PACKAGES, SLOTS, fmtDate, daysLeft, getVigencyEnd, fmtDisplay } from '@/lib/supabase'

export default function PortalPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [date, setDate] = useState(fmtDate(new Date()))
  const [slot, setSlot] = useState('morning')
  const [alert, setAlert] = useState<{ type: 'ok' | 'err' | 'warn'; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients)
  }, [])

  const client = clients.find(c => c.id === selectedId)

  useEffect(() => {
    if (!selectedId) return
    fetch(`/api/reservations?client_id=${selectedId}`).then(r => r.json()).then(setReservations)
  }, [selectedId])

  function getUsage() {
    if (!client) return { used: 0, nights: 0, total: 0, remaining: 0 }
    const used = reservations.filter(r => r.slot !== 'night').length
    const nights = reservations.filter(r => r.slot === 'night').length
    const total = PACKAGES[client.package].blocks
    return { used, nights, total, remaining: total - used }
  }

  async function makeReservation() {
    if (!selectedId || !date || !slot) return
    setSaving(true)
    setAlert(null)
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: selectedId, date, slot }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setAlert({ type: 'err', msg: json.error })
      return
    }
    setAlert({ type: 'ok', msg: `✅ Reserva confirmada: ${fmtDisplay(json.date)} · ${SLOTS[json.slot as keyof typeof SLOTS].label}` })
    // reload reservations
    fetch(`/api/reservations?client_id=${selectedId}`).then(r => r.json()).then(setReservations)
  }

  async function cancelReservation(id: string) {
    if (!confirm('¿Cancelar esta reserva?')) return
    await fetch(`/api/reservations/${id}`, { method: 'DELETE' })
    setReservations(prev => prev.filter(r => r.id !== id))
  }

  const { used, nights, total, remaining } = getUsage()
  const pct = total ? Math.round((used / total) * 100) : 0
  const dl = client ? daysLeft(client.start_date) : 0
  const nightCost = client ? nights * client.night_price : 0

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <a href="/" className="font-semibold text-slate-800" style={{ fontFamily: 'Fraunces, serif' }}>Modulare BR</a>
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full ml-auto">Portal de clientes</span>
      </nav>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Select client */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <label className="text-xs text-slate-500 mb-1 block">Selecciona tu perfil</label>
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setAlert(null) }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
          >
            <option value="">— elige tu nombre —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {client && (
          <>
            {/* Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  {client.name.split(' ').map(x => x[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div className="font-semibold">{client.name}</div>
                  <div className="text-xs text-slate-400">Paquete {PACKAGES[client.package].label} · ${PACKAGES[client.package].price}+IVA/mes</div>
                </div>
                <span className={`ml-auto text-xs px-2 py-1 rounded-full font-medium ${dl <= 5 ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                  {dl}d restantes
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs text-slate-400 mb-1">Bloques usados</div>
                  <div className="text-xl font-semibold">{used}/{total}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs text-slate-400 mb-1">Disponibles</div>
                  <div className={`text-xl font-semibold ${remaining === 0 ? 'text-red-500' : remaining <= 1 ? 'text-amber-500' : 'text-green-600'}`}>{remaining}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs text-slate-400 mb-1">Noches extra</div>
                  <div className="text-xl font-semibold">{nights}</div>
                  {nightCost > 0 && <div className="text-xs text-amber-600">${nightCost}</div>}
                </div>
              </div>
              <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Make reservation */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-700 mb-3">Reservar un bloque</h3>

              {alert && (
                <div className={`text-sm rounded-xl p-3 mb-3 ${alert.type === 'ok' ? 'bg-green-50 text-green-700' : alert.type === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                  {alert.msg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Fecha</label>
                  <input type="date" min={fmtDate(new Date())}
                    value={date} onChange={e => setDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Turno</label>
                  <select value={slot} onChange={e => setSlot(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
                    <option value="morning">☀️ Mañana (7am–12pm)</option>
                    <option value="afternoon">🌤️ Tarde (1pm–5pm)</option>
                    <option value="night">🌙 Noche extra (6pm–9pm)</option>
                  </select>
                </div>
              </div>

              {slot === 'night' && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mb-3">
                  🌙 El bloque nocturno tiene un costo extra de <strong>${client.night_price}</strong> por día. Tu administrador te cobrará por separado.
                </p>
              )}

              <button
                onClick={makeReservation}
                disabled={saving || remaining === 0 && slot !== 'night'}
                className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Confirmando…' : '📅 Confirmar reserva'}
              </button>

              {remaining === 0 && slot !== 'night' && (
                <p className="text-xs text-red-500 text-center mt-2">No tienes bloques disponibles en tu paquete actual.</p>
              )}
            </div>

            {/* My reservations */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-700 mb-3">Mis reservas</h3>
              {reservations.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Sin reservas activas</p>}
              <div className="space-y-2">
                {reservations.sort((a, b) => a.date.localeCompare(b.date)).map(r => {
                  const slotInfo = SLOTS[r.slot as keyof typeof SLOTS]
                  const isPast = new Date(r.date + 'T23:59:00') < new Date()
                  return (
                    <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 ${isPast ? 'opacity-50' : ''}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.slot === 'morning' ? 'bg-blue-400' : r.slot === 'afternoon' ? 'bg-green-400' : 'bg-amber-400'}`} />
                      <div className="flex-1 text-sm">
                        <span className="font-medium">{fmtDisplay(r.date)}</span>
                        <span className="text-slate-400"> · {slotInfo.label} · {slotInfo.time}</span>
                        {r.slot === 'night' && <span className="ml-2 text-xs text-amber-600">+${client.night_price}</span>}
                        {isPast && <span className="ml-2 text-xs text-slate-300">pasado</span>}
                      </div>
                      {!isPast && (
                        <button onClick={() => cancelReservation(r.id)} className="text-xs text-slate-300 hover:text-red-400 transition-colors">✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
