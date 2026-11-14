import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      { source: "/w/:ws", destination: "/w/:ws/pipelines", permanent: false },
      { source: "/w/:ws/settings", destination: "/w/:ws/settings/workspace", permanent: false },
      // Kanal ayarları Kaynaklar ekranına taşındı.
      { source: "/w/:ws/settings/channels", destination: "/w/:ws/sources", permanent: false },
    ];
  },
};

export default nextConfig;
