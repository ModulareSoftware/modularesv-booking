import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Package = 'premium' | 'basic' | 'lite'
export type Slot    = 'morning' | 'afternoon' | 'night'

export interface Client {
  id:           string
  name:         string
  contact:      string | null
  package:      Package
  start_date:   string
  night_price:  number
  sunday_price: number
  created_at:   string
  auth_user_id?: string | null
}

export interface Reservation {
  id:         string
  client_id:  string
  date:       string
  slot:       Slot
  created_at: string
  client?:    Client
}

export const PACKAGES: Record<Package, { label: string; blocks: number; price: number }> = {
  premium: { label: 'Premium',  blocks: 10, price: 200 },
  basic:   { label: 'Básico',   blocks: 6,  price: 160 },
  lite:    { label: 'Lite',     blocks: 3,  price: 125 },
}

export const SLOTS: Record<Slot, { label: string; time: string; emoji: string }> = {
  morning:   { label: 'Mañana',      time: '7:00am – 12:00pm', emoji: '☀️' },
  afternoon: { label: 'Tarde',       time: '1:00pm – 5:00pm',  emoji: '🌤️' },
  night:     { label: 'Noche extra', time: '6:00pm – 9:00pm',  emoji: '🌙' },
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

export function isExtraCharge(dateStr: string, slot: string): boolean {
  return slot === 'night' || isSunday(dateStr)
}

export function countsAgainstQuota(dateStr: string, slot: string): boolean {
  return !isSunday(dateStr) && slot !== 'night'
}
