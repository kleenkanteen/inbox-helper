/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

/** @type {import("next").NextConfig} */
const config = {
	async rewrites() {
		if (!convexSiteUrl) {
			return [];
		}

		const base = convexSiteUrl.endsWith("/")
			? convexSiteUrl.slice(0, -1)
			: convexSiteUrl;
		return [
			{
				source: "/api/:path*",
				destination: `${base}/api/:path*`,
			},
		];
	},
};

export default config;
