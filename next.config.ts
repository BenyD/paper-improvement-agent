import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships worker/canvas code the server bundler must not inline.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
