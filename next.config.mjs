import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 상위 폴더에 다른 package-lock.json 이 있어도 이 폴더를 루트로 고정한다.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
