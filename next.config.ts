import type { NextConfig } from "next";

// ADR-0003: Cache Components are intentionally disabled. Every workspace page reads
// the authenticated tenant context at request time; we do not want any shared
// server cache that could ever serve one organization's data to another.
const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  experimental: {
    // The proxy buffers request bodies; keep its cap in line with the Server Action limit below.
    proxyClientMaxBodySize: "12mb",
    serverActions: {
      // Resume uploads are capped at 10 MB in the action itself; leave headroom for multipart overhead.
      bodySizeLimit: "12mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
