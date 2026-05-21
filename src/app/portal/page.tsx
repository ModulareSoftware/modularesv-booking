'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Client, Reservation, PACKAGES, SLOTS, fmtDate, daysLeft, getVigencyEnd, ADMIN_EMAIL, isSunday, countsAgainstQuota, displayName, fmt$, DEPOSIT_STATUS } from '@/lib/supabase'

const IVA = 0.13

export default function PortalPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [date, setDate] = useState(fmtDate(new Date()))
  const [slot, setSlot] = useState('morning')
  const [alert, setAlert] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [portalTab, setPortalTab] = useState<'reservas' | 'facturacion'>('reservas')

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
    setAlert({ type: 'ok', msg: `✅ Reserva confirmada: ${new Date(json.date + 'T12:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} · ${SLOTS[json.slot as keyof typeof SLOTS].label}` })
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

  // Usage
  const usedQuota = reservations.filter(r => countsAgainstQuota(r.date, r.slot)).length
  const nights = reservations.filter(r => r.slot === 'night' && !isSunday(r.date)).length
  const sundays = reservations.filter(r => isSunday(r.date)).length
  const total = PACKAGES[client.package].blocks
  const remaining = total - usedQuota
  const pct = Math.round((usedQuota / total) * 100)
  const dl = daysLeft(client.start_date)
  const end = getVigencyEnd(client.start_date)

  // Billing
  const pkg = PACKAGES[client.package]
  const baseNeto = pkg.price
  const nightNeto = nights * client.night_price
  const sundayNeto = sundays * (client.sunday_price || 25)
  const totalNeto = baseNeto + nightNeto + sundayNeto
  const baseIva = baseNeto * IVA
  const nightIva = nightNeto * IVA
  const sundayIva = sundayNeto * IVA
  const totalIva = totalNeto * IVA
  const totalConIva = totalNeto * (1 + IVA)

  const depStatus = client.deposit_status ? DEPOSIT_STATUS[client.deposit_status] : null

  const isSelectedSunday = isSunday(date)
  const isSelectedNight = slot === 'night'
  const canBook = isSelectedSunday || isSelectedNight || remaining > 0

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <span className="font-semibold text-slate-800" style={{ fontFamily: 'Fraunces, serif' }}>Modulare Flex Office</span>
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full ml-auto">Portal de clientes</span>
        <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">Salir</button>
      </nav>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Summary card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
              {displayName(client).split(' ').map((x: string) => x[0]).slice(0, 2).join('')}
            </div>
            <div>
              <div className="font-semibold">{displayName(client)}</div>
              {client.company_name && <div className="text-xs text-slate-400">{client.name}</div>}
              <div className="text-xs text-slate-400">Paquete {pkg.label} · {fmt$(pkg.price)}+IVA/mes</div>
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
              {nights > 0 && <div className="text-xs text-amber-600">{fmt$(nightNeto)}</div>}
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Domingos</div>
              <div className="text-xl font-semibold">{sundays}</div>
              {sundays > 0 && <div className="text-xs text-purple-600">{fmt$(sundayNeto)}</div>}
            </div>
          </div>
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-slate-400 mt-2">Vigencia hasta {end.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          <button onClick={() => setPortalTab('reservas')}
            className={`flex-1 text-sm py-2 rounded-lg transition-all ${portalTab === 'reservas' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>
            📅 Mis reservas
          </button>
          <button onClick={() => setPortalTab('facturacion')}
            className={`flex-1 text-sm py-2 rounded-lg transition-all ${portalTab === 'facturacion' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>
            💰 Facturación
          </button>
        </div>

        {/* ── RESERVAS ── */}
        {portalTab === 'reservas' && (
          <>
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
              {isSelectedSunday && !isSelectedNight && (
                <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2 mb-3">
                  🗓️ Domingo: costo extra de <strong>{fmt$(client.sunday_price || 25)}</strong> por bloque.
                </p>
              )}
              {isSelectedNight && !isSelectedSunday && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mb-3">
                  🌙 Noche extra: costo de <strong>{fmt$(client.night_price)}</strong> por bloque.
                </p>
              )}
              {isSelectedSunday && isSelectedNight && (
                <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2 mb-3">
                  🗓️🌙 Domingo nocturno: costo extra de <strong>{fmt$(client.sunday_price || 25)}</strong> por bloque.
                </p>
              )}
              <button onClick={makeReservation} disabled={saving || !canBook}
                className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving ? 'Confirmando…' : '📅 Confirmar reserva'}
              </button>
              {!canBook && <p className="text-xs text-red-500 text-center mt-2">No tienes bloques disponibles en tu paquete actual.</p>}
            </div>

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
                        {extraCost > 0 && <span className="ml-2 text-xs text-amber-600">+{fmt$(extraCost)}</span>}
                        {isPast && <span className="ml-2 text-xs text-slate-300">pasado</span>}
                      </div>
                      {!isPast && <button onClick={() => cancelReservation(r.id)} className="text-xs text-slate-300 hover:text-red-400">✕</button>}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ── FACTURACIÓN ── */}
        {portalTab === 'facturacion' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="mb-4">
              <h3 className="font-semibold text-slate-700">Resumen de facturación</h3>
              <p className="text-xs text-slate-400 mt-0.5">Mes en curso · IVA 13%</p>
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-1">Neto</div>
                <div className="text-lg font-semibold text-slate-700">{fmt$(totalNeto)}</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-1">IVA 13%</div>
                <div className="text-lg font-semibold text-slate-500">{fmt$(totalIva)}</div>
              </div>
              <div className="bg-blue-600 rounded-xl p-3">
                <div className="text-xs text-blue-200 mb-1">Total</div>
                <div className="text-lg font-semibold text-white">{fmt$(totalConIva)}</div>
              </div>
            </div>

            {/* Desglose mensual */}
            <div className="border border-slate-100 rounded-xl overflow-hidden mb-4">
              <div className="grid grid-cols-4 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400 border-b border-slate-100">
                <span>Concepto</span>
                <span className="text-right">Neto</span>
                <span className="text-right">IVA</span>
                <span className="text-right">Total</span>
              </div>
              <div className="grid grid-cols-4 px-3 py-2.5 text-sm border-b border-slate-50">
                <span className="text-slate-600">
                  Paquete {pkg.label}
                  <span className="text-xs text-slate-400 block">{pkg.blocks} bloques</span>
                </span>
                <span className="text-right text-slate-600">{fmt$(baseNeto)}</span>
                <span className="text-right text-slate-400">{fmt$(baseIva)}</span>
                <span className="text-right font-medium">{fmt$(baseNeto + baseIva)}</span>
              </div>
              {nights > 0 && (
                <div className="grid grid-cols-4 px-3 py-2.5 text-sm border-b border-slate-50">
                  <span className="text-slate-600">
                    Noches extra
                    <span className="text-xs text-slate-400 block">{nights} × {fmt$(client.night_price)}</span>
                  </span>
                  <span className="text-right text-slate-600">{fmt$(nightNeto)}</span>
                  <span className="text-right text-slate-400">{fmt$(nightIva)}</span>
                  <span className="text-right font-medium">{fmt$(nightNeto + nightIva)}</span>
                </div>
              )}
              {sundays > 0 && (
                <div className="grid grid-cols-4 px-3 py-2.5 text-sm border-b border-slate-50">
                  <span className="text-slate-600">
                    Domingos
                    <span className="text-xs text-slate-400 block">{sundays} × {fmt$(client.sunday_price || 25)}</span>
                  </span>
                  <span className="text-right text-slate-600">{fmt$(sundayNeto)}</span>
                  <span className="text-right text-slate-400">{fmt$(sundayIva)}</span>
                  <span className="text-right font-medium">{fmt$(sundayNeto + sundayIva)}</span>
                </div>
              )}
              <div className="grid grid-cols-4 px-3 py-2.5 text-sm bg-slate-50 font-semibold">
                <span className="text-slate-700">Total mes</span>
                <span className="text-right text-slate-700">{fmt$(totalNeto)}</span>
                <span className="text-right text-slate-500">{fmt$(totalIva)}</span>
                <span className="text-right text-blue-600">{fmt$(totalConIva)}</span>
              </div>
            </div>

            {/* Depósito de garantía */}
            {client.deposit_amount > 0 && depStatus && (
              <div className={`rounded-xl border p-3 ${
                client.deposit_status === 'pagado' ? 'border-green-100 bg-green-50' :
                client.deposit_status === 'devuelto' ? 'border-blue-100 bg-blue-50' :
                client.deposit_status === 'retenido' ? 'border-red-100 bg-red-50' :
                'border-amber-100 bg-amber-50'
              }`}>
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

            <p className="text-xs text-slate-300 text-center mt-4">
              Este resumen es informativo. Tu administrador emitirá la factura oficial.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
