import type { NextConfig } from "next";

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
};

export default nextConfig;
