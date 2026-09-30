import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@repo/core", "@repo/ui"],
  agentRules: false,
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  outputFileTracingIncludes: {
    "/": ["./data/catalog.db"],
    "/destinations": ["./data/catalog.db"],
    "/image/*": ["./public/images/**/*"],
  },
  experimental: {
    inlineCss: true,
  },
};
export default config;
