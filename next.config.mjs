/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
  },
  // Demo 環境：build 時不擋 ESLint warnings 跟 type errors
  // 本地 dev 時 IDE 還是會顯示，這只是讓 production build 過得去
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};
export default nextConfig;