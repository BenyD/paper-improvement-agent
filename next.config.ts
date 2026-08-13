import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships worker/canvas code the server bundler must not inline.
  serverExternalPackages: ["pdfjs-dist"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // No third-party embedding, no MIME sniffing, no referrer leakage.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
