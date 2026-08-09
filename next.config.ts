import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {},
  serverExternalPackages: ['pg', 'mysql2', 'ioredis', 'mongodb'],
}

export default nextConfig
