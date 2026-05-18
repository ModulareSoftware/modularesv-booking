import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-semibold mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
          ModularESV
        </h1>
        <p className="text-slate-500 text-lg">Sistema de reservas de espacios flexibles</p>
      </div>

      <div className="grid gap-4 w-full max-w-sm">
        <Link
          href="/portal"
          className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-400 hover:shadow-md transition-all group"
        >
          <span className="text-3xl">🗓️</span>
          <div>
            <div className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
              Portal de clientes
            </div>
            <div className="text-sm text-slate-400">Reserva tus bloques disponibles</div>
          </div>
        </Link>

        <Link
          href="/admin"
          className="flex items-center gap-3 bg-blue-600 text-white rounded-2xl p-5 hover:bg-blue-700 transition-all group"
        >
          <span className="text-3xl">🛡️</span>
          <div>
            <div className="font-semibold">Panel de administrador</div>
            <div className="text-sm text-blue-200">Gestión completa de clientes y reservas</div>
          </div>
        </Link>
      </div>

      <p className="mt-10 text-xs text-slate-300">modularesv.com</p>
    </main>
  )
}
