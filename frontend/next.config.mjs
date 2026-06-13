/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Linting runs as its own CI gate (`npm run lint`); don't fail the production
  // build on lint findings. Type errors still fail the build via tsc.
  eslint: { ignoreDuringBuilds: true },
  allowedDevOrigins: ['*.replit.dev', '*.riker.replit.dev', '*.repl.co', '*.kirk.replit.dev', '127.0.0.1'],
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
    return [
      {
        source: "/(.*)",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
