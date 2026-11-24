import type { NextConfig } from "next";

const basePath = process.env.PAGES_BASE_PATH || "";
const isStatic = !process.env.NEXT_PUBLIC_API_URL;

const nextConfig: NextConfig = {
	...(isStatic ? { output: "export" as const } : {}),
	basePath,
	trailingSlash: true,
	images: { unoptimized: true },
	env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_BUILD_ID: (process.env.GITHUB_SHA || Date.now().toString(36)).slice(0, 12) },
	turbopack: { root: __dirname },
};

export default nextConfig;
