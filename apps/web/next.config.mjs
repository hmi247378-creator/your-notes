/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Force Webpack to bypass Turbopack bug with Chinese characters in path
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;

