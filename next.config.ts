import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: '/uploads/wishlist/**',
      },
    ],
  },
}

export default nextConfig
