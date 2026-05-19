'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Client, Reservation, PACKAGES, SLOTS, fmtDate, daysLeft, getVigencyEnd, fmtDisplay, ADMIN_EMAIL } from '@/lib/supabase'

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
        .from('clients')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()

      if (byUserId) {
        setClient(byUserId)
      } else {
        const { data: byEmail } = await supabase
          .from('clients')
          .select('*')
          .eq('contact', user.email)
          .single()
        if (byEmail) setClient(byEmail)
      }
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!client) return
    fetch(`/api/reservations?client_id=${client.id}`)
      .then(r => r.json())
      .then(setReservations)
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

  const used = reservations.filter(r => r.slot !== 'night').length
  const nights = reservations.filter(r => r.slot === 'night').length
  const total = PACKAGES[client.package].blocks
  const remaining = total - used
  const pct = Math.round((used / total) * 100)
  const dl = daysLeft(client.start_date)
  const end = getVigencyEnd(client.start_date)
  const nightCost = nights * client.night_price

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <span className="font-semibold text-slate-800" style={{ fontFamily: 'Fraunces, serif' }}>Modulare BR</span>
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full ml-auto">Portal de clientes</span>
        <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">Salir</button>
      </nav>

      <div className="max-w-lg mx-auto p-4 space-y-4">
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
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Bloques usados</div>
              <div className="text-xl font-semibold">{used}/{total}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs te
