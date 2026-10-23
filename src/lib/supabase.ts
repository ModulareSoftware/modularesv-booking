import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Package = 'elite' | 'premium' | 'basic' | 'lite'
export type Slot    = 'morning' | 'afternoon' | 'night'
export type DepositStatus = 'pendiente' | 'pagado' | 'devuelto' | 'retenido'

export interface Client {
  id:             string
  name:           string
  company_name:   string | null
  contact:        string | null
  package:        Package
  start_date:     string
  night_price:    number
  sunday_price:   number
  deposit_amount: number
  deposit_status: DepositStatus
  deposit_date:   string | null
  created_at:     string
  auth_user_id?:  string | null
  allow_advance?: boolean | null
}

export interface Reservation {
  id:         string
  client_id:  string
  date:       string
  slot:       Slot
  created_at: string
  advance_month_start?: string | null
  client?:    Client
}

export const PACKAGES: Record<Package, { label: string; dayBlocks: number; nightBlocks: number; price: number }> = {
  elite:   { label: 'Élite',   dayBlocks: 15, nightBlocks: 7, price: 190 },
  premium: { label: 'Premium', dayBlocks: 12, nightBlocks: 5, price: 170 },
  basic:   { label: 'Básico',  dayBlocks: 9,  nightBlocks: 3, price: 150 },
  lite:    { label: 'Lite',    dayBlocks: 5,  nightBlocks: 0, price: 90 },
}

export const SLOTS: Record<Slot, { label: string; time: string; emoji: string }> = {
  morning:   { label: 'Mañana',      time: '7:00am – 12:00pm', emoji: '☀️' },
  afternoon: { label: 'Tarde',       time: '1:00pm – 5:00pm',  emoji: '🌤️' },
  night:     { label: 'Noche extra', time: '6:00pm – 9:00pm',  emoji: '🌙' },
}

export const DEPOSIT_STATUS: Record<DepositStatus, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente',  color: 'bg-amber-50 text-amber-600' },
  pagado:    { label: 'Pagado',     color: 'bg-green-50 text-green-600' },
  devuelto:  { label: 'Devuelto',   color: 'bg-blue-50 text-blue-600' },
  retenido:  { label: 'Retenido',   color: 'bg-red-50 text-red-600' },
}

export const ADMIN_EMAIL = 'admin@modularesv.com'

export function getVigencyEnd(startDate: string): Date {
  const d = new Date(startDate + 'T12:00:00')
  d.setDate(d.getDate() + 30)
  return d
}

export function daysLeft(startDate: string): number {
  const end = getVigencyEnd(startDate)
  const now = new Date()
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000))
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function fmtDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-SV', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function isSunday(dateStr: string): boolean {
  return new Date(dateStr + 'T12:00:00').getDay() === 0
}

export function countsAgainstQuota(dateStr: string, slot: string): boolean {
  return !isSunday(dateStr) && slot !== 'night'
}

// Fecha que decide a qué mes del contrato cuenta una reserva para el cupo.
// Si el turno se tomó "adelantado" del mes siguiente, cuenta en ese mes.
export function quotaDate(r: { date: string; advance_month_start?: string | null }): string {
  return r.advance_month_start || r.date
}

export function displayName(client: Client): string {
  return client.company_name || client.name
}

export function fmt$(n: number): string {
  return `$${n.toFixed(2)}`
}

// ── Renovaciones de contrato ──
// Días antes del fin del contrato en que se habilita la renovación
export const RENEWAL_WINDOW_DAYS = 20

// Fecha local de hoy (YYYY-MM-DD), sin desfase UTC
export function todayLocalStr(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Días que faltan desde hoy hasta una fecha (0 = es hoy, negativo = ya pasó)
export function daysUntil(dateStr: string, today: string = todayLocalStr()): number {
  const a = new Date(today + 'T12:00:00').getTime()
  const b = new Date(dateStr + 'T12:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

// Número de la renovación: C001-JO → C001-JO-R1 → C001-JO-R2
export function renewalContractNumber(prev: string): string {
  const m = String(prev || '').match(/^(.*)-R(\d+)$/)
  return m ? `${m[1]}-R${parseInt(m[2]) + 1}` : `${prev}-R1`
}

export function fmtShort(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const CONTRACT_STATUS: Record<string, { label: string; color: string }> = {
  active:    { label: 'Vigente',    color: 'bg-blue-50 text-blue-600' },
  upcoming:  { label: 'Próximo',    color: 'bg-green-50 text-green-600' },
  finished:  { label: 'Finalizado', color: 'bg-slate-100 text-slate-500' },
  cancelled: { label: 'Anulado',    color: 'bg-red-50 text-red-500' },
}
