import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Produktbilleder fra ordrehistorikken.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.nemlig.com",
      },
    ],
  },
};

export default nextConfig;
