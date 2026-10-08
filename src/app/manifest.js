import type { MetadataRoute } from 'next'

// Manifiesto de la app instalable (PWA). Next.js lo publica en /manifest.webmanifest
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Modulare Flex Office',
    short_name: 'Flex Office',
    description: 'Reserva y administra tus bloques en Modulare Flex Office',
    id: '/',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#ffffff',
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
