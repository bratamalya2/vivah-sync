import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

// The monorepo keeps one .env at the repo root. Load it here so the web app
// (run with cwd = apps/web) sees the shared config without duplicating secrets.
// On Vercel there is no .env file — the dashboard's env vars are used instead.
// Only NEXT_PUBLIC_* values are exposed to the client below.
config({ path: '../../.env' })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Trace server files from the monorepo root so workspace packages and the
  // hoisted node_modules are bundled into each Vercel function.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // pdfkit reads its built-in font metrics (data/*.afm) from disk at runtime;
  // make sure they ship with the on-demand playbook PDF route.
  outputFileTracingIncludes: {
    // (globs are relative to apps/web; pdfkit is normally hoisted to the root)
    '/dashboard/projects/[id]/playbook/[pbId]/pdf': [
      '../../node_modules/pdfkit/js/data/**/*',
      './node_modules/pdfkit/js/data/**/*',
    ],
  },
  // Workspace packages are TS source — Next must transpile them.
  transpilePackages: ['@vivahsync/db', '@vivahsync/core'],
  // Server-only packages; never bundle for the client.
  serverExternalPackages: ['pg', '@supabase/supabase-js', 'unpdf', 'qrcode', 'pdfkit'],
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
