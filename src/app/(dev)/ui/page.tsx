import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Gallery } from './gallery'

export const metadata: Metadata = {
  title: 'Galeria de primitivos',
  robots: { index: false, follow: false },
}

/**
 * Galeria de desenvolvimento dos primitivos `src/components/fc/`.
 * Em produção responde 404 (CA-09). A proteção por sessão em dev vem do proxy (F0-06).
 */
export default function UiGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return <Gallery />
}
