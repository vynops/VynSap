import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {},
  serverExternalPackages: ['pg', 'mysql2', 'ioredis', 'mongodb', '@sap/hana-client'],
}

export default nextConfig
