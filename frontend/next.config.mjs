/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Linting runs as its own CI gate (`npm run lint`); don't fail the production
  // build on lint findings. Type errors still fail the build via tsc.
  eslint: { ignoreDuringBuilds: true },
  // Hosts allowed to load Next.js dev resources (/_next/*, HMR) cross-origin. The
  // local mirror is served through Traefik as dev.veldrixai.ca / api.dev.veldrixai.ca,
  // so those MUST be listed or the dev server blocks chunks+HMR and the app never
  // hydrates (buttons/sections dead). Replit hosts kept for the cloud dev sandbox.
  allowedDevOrigins: ['dev.veldrixai.ca', 'api.dev.veldrixai.ca', '*.veldrixai.ca', '*.replit.dev', '*.riker.replit.dev', '*.repl.co', '*.kirk.replit.dev', '127.0.0.1'],
  experimental: {
    optimizePackageImports: [
      "recharts",
    ],
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    const baseHeaders = [
      {
        source: "/(.*)",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
    // A long-lived immutable cache is correct for built assets in production, but
    // it BREAKS Next.js dev: Turbopack recompiles reuse /_next/static URLs, so the
    // browser serves stale chunks (or a stale URL 404s into HTML, which nosniff then
    // refuses to execute) and hydration silently fails. Apply it only in prod.
    if (process.env.NODE_ENV === "production") {
      baseHeaders.push({
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      });
    }
    return baseHeaders;
  },
};

export default nextConfig;
