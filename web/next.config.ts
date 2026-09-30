import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Alle tre mæglerkæders billeder serveres fra samme mindworking.eu-platform,
    // hver fra deres eget subdomæne (home./nybolig./danbolig.mindworking.eu).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.mindworking.eu",
      },
    ],
  },
};

export default nextConfig;
