import type { MetadataRoute } from 'next'

/**
 * Manifest PWA (FC2-F0-05). `theme_color` e `background_color` exigem valor literal (o manifest
 * não aceita `var()`): é o valor de `--fc-void`, e `src/app/pwa.test.ts` falha se divergir do
 * token. Este arquivo está na allowlist do guard `no-literal-colors`.
 */
const VOID = '#04060b'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finance Controller',
    short_name: 'FC',
    description: 'Finanças pessoais, no seu bolso.',
    start_url: '/hoje',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: VOID,
    theme_color: VOID,
    lang: 'pt-BR',
    categories: ['finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
