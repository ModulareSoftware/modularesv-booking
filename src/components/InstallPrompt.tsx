'use client'
import { useEffect, useState } from 'react'

// Android/Chrome: botón que abre la instalación nativa.
// iPhone/iPad: explica Compartir → "Agregar a inicio" (iOS no tiene botón automático).
// Se oculta si la app ya está instalada o si el usuario la cierra.

const DISMISS_KEY = 'flexoffice-install-dismissed'

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

export default function InstallPrompt() {
  const [mode, setMode] = useState<'hidden' | 'android' | 'ios'>('hidden')
  const [deferred, setDeferred] = useState<any>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    if (standalone || readDismissed()) return

    const ua = navigator.userAgent
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
    if (isIOS) { setMode('ios'); return }

    function onPrompt(e: Event) {
      e.preventDefault()
      setDeferred(e)
      setMode('android')
    }
    function onInstalled() { setMode('hidden') }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setMode('hidden')
  }

  async function install() {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice.catch(() => null)
    setDeferred(null)
    setMode('hidden')
  }

  if (mode === 'hidden') return null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
      <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-700">Instala la app en tu teléfono</div>
        {mode === 'ios' ? (
          <div className="text-xs text-slate-500 leading-snug mt-0.5">
            Toca <ShareIcon /> <strong>Compartir</strong> y luego <strong>“Agregar a inicio”</strong>.
          </div>
        ) : (
          <div className="text-xs text-slate-500 leading-snug mt-0.5">Ábrela desde tu pantalla de inicio, como cualquier app.</div>
        )}
      </div>
      {mode === 'android' && (
        <button onClick={install} className="bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-xl flex-shrink-0">
          Instalar
        </button>
      )}
      <button onClick={dismiss} aria-label="Cerrar" className="text-slate-300 hover:text-slate-500 w-8 h-8 flex items-center justify-center flex-shrink-0">✕</button>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg className="inline -mt-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}
