/** @type {import('next').NextConfig} */
const ORCH = process.env.ORCHESTRATOR_URL ?? "http://localhost:8787";

export default {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${ORCH}/api/:path*` }];
  },
  transpilePackages: ["@gov/shared"],
};
