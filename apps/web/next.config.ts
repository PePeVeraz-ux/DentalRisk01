import type { NextConfig } from 'next';
import { resolve } from 'node:path';
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  turbopack: { root: resolve(import.meta.dirname, '../..') },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000'}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default config;
