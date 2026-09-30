import type { NextConfig } from "next";
const config: NextConfig = { transpilePackages: ["@repo/core", "@repo/ui"], agentRules: false };
export default config;
