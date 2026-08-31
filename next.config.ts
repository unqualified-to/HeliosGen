import path from "node:path";
import type { NextConfig } from "next";

/** ensureStorage() stores absolute URLs when CALLBACK_BASE_URL is set, so the
 *  image optimizer must trust our own host or those records fail with a 400. */
const selfHostname = (() => {
  try {
    return process.env.CALLBACK_BASE_URL ? new URL(process.env.CALLBACK_BASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.64.2"],
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    proxyClientMaxBodySize: '30mb',
  },
  serverExternalPackages: ["undici"],
  images: {
    remotePatterns: [
      ...(selfHostname ? [{ protocol: "https" as const, hostname: selfHostname }] : []),
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "*.replicate.delivery" },
      { protocol: "https", hostname: "pbxt.replicate.delivery" },
      { protocol: "https", hostname: "*.replicate.com" },
      { protocol: "https", hostname: "*.aiquickdraw.com" },
    ],
  },
};

export default nextConfig;
