import { config } from 'dotenv'

// The monorepo keeps one .env at the repo root. Load it here so the web app
// (run with cwd = apps/web) sees the shared config without duplicating secrets.
// Only NEXT_PUBLIC_* values are exposed to the client below.
config({ path: '../../.env' })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Evidence photo/video uploads go through Server Actions.
  experimental: {
    serverActions: { bodySizeLimit: '30mb' },
  },
  // Workspace packages are TS source — Next must transpile them.
  transpilePackages: ['@vivahsync/db', '@vivahsync/core'],
  // Server-only packages; never bundle for the client.
  serverExternalPackages: ['pg', '@supabase/supabase-js'],
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  webpack: (webpackConfig) => {
    // The workspace packages use NodeNext-style ".js" import specifiers that
    // point at ".ts" source; teach webpack to resolve them.
    webpackConfig.resolve.extensionAlias = {
      ...(webpackConfig.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    }
    return webpackConfig
  },
}

export default nextConfig
