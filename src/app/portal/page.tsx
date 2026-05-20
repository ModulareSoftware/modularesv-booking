'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Client, Reservation, PACKAGES, SLOTS, fmtDate, daysLeft, getVigencyEnd, fmtDisplay, ADMIN_EMAIL, isSunday, countsAgainstQuota } from '@/lib/supabase'

export default function PortalPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [date, setDate] = useState(fmtDate(new Date()))
  const [slot, setSlot] = useState('morning')
  const [alert, setAlert] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (user.email === ADMIN_EMAIL) { router.push('/admin'); return }

      const { data: byUserId } = await supabase
        .from('clients').select('*').eq('auth_user_id', user.id).single()

      if (byUserId) {
        setClient(byUserId)
      } else {
        const { data: byEmail } = await supabase
          .from('clients').select('*').eq('contact', user.email).single()
        if (byEmail) setClient(byEmail)
      }
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!client) return
    fetch(`/api/reservations?client_id=${client.id}`)
      .then(r => r.json()).then(setReservations)
  }, [client])

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
      body: JSON.stringify({ client_id: client.id, date, slot }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setAlert({ type: 'err', msg: json.error }); return }
    setAlert({ type: 'ok', msg: `✅ Reserva confirmada: ${fmtDisplay(json.date)} · ${SLOTS[json.slot as keyof typeof SLOTS].label}` })
    fetch(`/api/reservations?client_id=${client.id}`).then(r => r.json()).then(setReservations)
  }

  async function cancelReservation(id: string) {
    if (!confirm('¿Cancelar esta reserva?')) return
    await fetch(`/api/reservations/${id}`, { method: 'DELETE' })
    setReservations(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
  )

  if (!client) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="font-semibold text-slate-700 mb-2">Cuenta no vinculada</h2>
        <p className="text-slate-400 text-sm mb-4">Tu cuenta no está vinculada a ningún cliente. Contacta al administrador.</p>
        <button onClick={logout} className="text-sm text-blue-600 hover:underline">Cerrar sesión</button>
      </div>
    </div>
  )

  // Calculate usage
  const usedQuota = reservations.filter(r => countsAgainstQuota(r.date, r.slot)).length
  const nights = reservations.filter(r => r.slot === 'night' && !isSunday(r.date)).length
  const sundays = reservations.filter(r => isSunday(r.date)).length
  const total = PACKAGES[client.package].blocks
  const remaining = total - usedQuota
  const pct = Math.round((usedQuota / total) * 100)
  const dl = daysLeft(client.start_date)
  const end = getVigencyEnd(client.start_date)
  const nightCost = nights * client.night_price
  const sundayCost = sundays * (client.sunday_price || 25)

  const isSelectedSunday = isSunday(date)
  const isSelectedNight = slot === 'night'
  const isExtra = isSelectedSunday || isSelectedNight
  const canBook = isExtra || remaining > 0

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <span className="font-semibold text-slate-800" style={{ fontFamily: 'Fraunces, serif' }}>Modulare Flex Office</span>
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full ml-auto">Portal de clientes</span>
        <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">Salir</button>
      </nav>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
              {client.name.split(' ').map((x: string) => x[0]).slice(0, 2).join('')}
            </div>
            <div>
              <div className="font-semibold">{client.name}</div>
              <div className="text-xs text-slate-400">Paquete {PACKAGES[client.package].label} · ${PACKAGES[client.package].price}+IVA/mes</div>
            </div>
            <span className={`ml-auto text-xs px-2 py-1 rounded-full font-medium ${dl <= 5 ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
              {dl}d restantes
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Usados</div>
              <div className="text-xl font-semibold">{usedQuota}/{total}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Disponibles</div>
              <div className={`text-xl font-semibold ${remaining === 0 ? 'text-red-500' : remaining <= 1 ? 'text-amber-500' : 'text-green-600'}`}>{remaining}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Noches</div>
              <div className="text-xl font-semibold">{nights}</div>
              {nightCost > 0 && <div className="text-xs text-amber-600">${nightCost}</div>}
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Domingos</div>
              <div className="text-xl font-semibold">{sundays}</div>
              {sundayCost > 0 && <div className="text-xs text-amber-600">${sundayCost}</div>}
            </div>
          </div>
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-slate-400 mt-2">Vigencia hasta {end.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
        </div>

        {/* Make reservation */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-700 mb-3">Reservar un bloque</h3>
          {alert && (
            <div className={`text-sm rounded-xl p-3 mb-3 ${alert.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {alert.msg}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Fecha</label>
              <input type="date" min={fmtDate(new Date())} value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              {date && <div className="text-xs text-slate-400 mt-1">
                {new Date(date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>}
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

          {isSelectedSunday && (
            <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2 mb-3">
              🗓️ Domingo: costo extra de <strong>${client.sunday_price || 25}</strong> por bloque. Tu administrador te cobrará por separado.
            </p>
          )}
          {isSelectedNight && !isSelectedSunday && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mb-3">
              🌙 Noche extra: costo de <strong>${client.night_price}</strong> por bloque. Tu administrador te cobrará por separado.
            </p>
          )}
          {isSelectedSunday && isSelectedNight && (
            <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2 mb-3">
              🗓️🌙 Domingo nocturno: costo extra de <strong>${client.sunday_price || 25}</strong> por bloque.
            </p>
          )}

          <button onClick={makeReservation} disabled={saving || !canBook}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {saving ? 'Confirmando…' : '📅 Confirmar reserva'}
          </button>
          {!canBook && (
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
              const isDom = isSunday(r.date)
              const extraCost = isDom ? (client.sunday_price || 25) : r.slot === 'night' ? client.night_price : 0
              return (
                <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 ${isPast ? 'opacity-50' : ''}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.slot === 'morning' ? 'bg-blue-400' : r.slot === 'afternoon' ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <div className="flex-1 text-sm">
                    <span className="font-medium">
                      {new Date(r.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                    <span className="text-slate-400"> · {slotInfo.label}</span>
                    {isDom && <span className="ml-1 text-xs text-purple-600">🗓️ dom</span>}
                    {extraCost > 0 && <span className="ml-2 text-xs text-amber-600">+${extraCost}</span>}
                    {isPast && <span className="ml-2 text-xs text-slate-300">pasado</span>}
                  </div>
                  {!isPast && <button onClick={() => cancelReservation(r.id)} className="text-xs text-slate-300 hover:text-red-400">✕</button>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
