import { fmt$ } from '@/lib/supabase'

// Filas de la tabla de facturación (Concepto · Neto · IVA · Total).
// En computadora: 4 columnas. En teléfono: Concepto + Total, y Neto/IVA
// aparecen como una línea pequeña debajo del concepto para que nada se salga.

const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]'

export function BillHeader() {
  return (
    <div className={`${GRID} bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400 border-b border-slate-100`}>
      <span>Concepto</span>
      <span className="hidden sm:block text-right">Neto</span>
      <span className="hidden sm:block text-right">IVA 13%</span>
      <span className="text-right">Total</span>
    </div>
  )
}

export function BillLine({ label, sub, neto, iva, children, details, total = false }: {
  label: React.ReactNode
  sub?: React.ReactNode
  neto: number
  iva: number
  children?: React.ReactNode   // p. ej. botón/estado de pago bajo el concepto
  details?: React.ReactNode    // p. ej. lista de fechas con su estado de cobro
  total?: boolean              // fila de total (resaltada)
}) {
  return (
    <div className={total ? 'bg-slate-50' : 'border-b border-slate-50'}>
      <div className={`${GRID} px-3 py-2.5 text-sm items-start ${total ? 'font-semibold' : ''}`}>
        <div className="min-w-0">
          <span className={total ? 'text-slate-700' : 'text-slate-600'}>{label}</span>
          {sub && <span className="text-xs text-slate-400 block font-normal">{sub}</span>}
          <span className="sm:hidden text-xs text-slate-400 block font-normal mt-0.5">
            Neto {fmt$(neto)} · IVA {fmt$(iva)}
          </span>
          {children}
        </div>
        <span className={`hidden sm:block text-right whitespace-nowrap ${total ? 'text-slate-700' : 'text-slate-600'}`}>{fmt$(neto)}</span>
        <span className={`hidden sm:block text-right whitespace-nowrap ${total ? 'text-slate-500' : 'text-slate-400'}`}>{fmt$(iva)}</span>
        <span className={`text-right whitespace-nowrap ${total ? 'text-blue-600' : 'font-medium'}`}>{fmt$(neto + iva)}</span>
      </div>
      {details && <div className="px-3 pb-2 space-y-1">{details}</div>}
    </div>
  )
}
