import type { NextConfig } from "next";

// Sent with every page and API response. Framing is refused so no other site
// can overlay NinjaPay's send and sign buttons (clickjacking). The camera is
// allowed for NinjaPay's own pages only (Send's QR scanner); microphone and
// location aren't used, so browsers are told to refuse them.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Only compile the modules actually imported from these large packages.
    optimizePackageImports: [
      "@injectivelabs/sdk-ts",
      "@injectivelabs/networks",
      "@injectivelabs/utils",
      "viem",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
