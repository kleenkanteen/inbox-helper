import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const optionalInDev = () =>
	process.env.NODE_ENV === "production" ? z.string() : z.string().optional();

export const env = createEnv({
	server: {
		BETTER_AUTH_SECRET: optionalInDev(),
		BETTER_AUTH_GITHUB_CLIENT_ID: z.string().optional(),
		BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
		CONVEX_URL: optionalInDev(),
		GOOGLE_CLIENT_ID: optionalInDev(),
		GOOGLE_CLIENT_SECRET: optionalInDev(),
		GOOGLE_REDIRECT_URI: optionalInDev(),
		XAI_API_KEY: optionalInDev(),
		OPENAI_API_KEY: optionalInDev(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
	},
	client: {},
	runtimeEnv: {
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_GITHUB_CLIENT_ID: process.env.BETTER_AUTH_GITHUB_CLIENT_ID,
		BETTER_AUTH_GITHUB_CLIENT_SECRET:
			process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
		CONVEX_URL: process.env.CONVEX_URL,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
		GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
		XAI_API_KEY: process.env.XAI_API_KEY,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		NODE_ENV: process.env.NODE_ENV,
	},
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
