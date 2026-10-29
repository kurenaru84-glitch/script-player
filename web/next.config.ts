import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // スマホから LAN IP で dev に接続するときの HMR / アセット用
  allowedDevOrigins: ["192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
