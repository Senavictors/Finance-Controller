import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // O app não usa next/image; sem otimizador, /_next/image não fica exposto.
  images: { unoptimized: true },
}

export default nextConfig
