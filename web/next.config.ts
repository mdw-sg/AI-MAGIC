import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // home/nybolig/danbolig/estate deler alle samme mindworking.eu-platform,
    // hver fra deres eget subdomæne. edc.dk kører sin egen billedserver.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.mindworking.eu",
      },
      {
        protocol: "https",
        hostname: "billeder.edc.dk",
      },
    ],
  },
};

export default nextConfig;
