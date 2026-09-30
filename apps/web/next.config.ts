import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@repo/core", "@repo/ui"],
  agentRules: false,
  experimental: {
    inlineCss: true,
  },
};
export default config;
