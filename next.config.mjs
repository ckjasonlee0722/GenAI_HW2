/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '8mb' }, // for image uploads
  },
};
export default nextConfig;
