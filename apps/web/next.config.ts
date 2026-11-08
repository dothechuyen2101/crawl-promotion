import type { NextConfig } from 'next';

const config: NextConfig = {
  // packages/shared xuất mã nguồn TypeScript trực tiếp
  transpilePackages: ['@cp/shared'],
  images: { unoptimized: true },
  serverExternalPackages: ['exceljs'],
};

export default config;
