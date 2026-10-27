import type { NextConfig } from "next";
import { securityHeaderRules } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
  },
  async headers() {
    return securityHeaderRules();
  },
};

export default nextConfig;
