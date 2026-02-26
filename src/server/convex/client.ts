import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { env } from "#/env";

const getClient = () => {
	const url = env.CONVEX_URL;
	if (!url) {
		throw new Error("Missing CONVEX_URL");
	}
	return new ConvexHttpClient(url);
};

export const convexQuery = async <T = unknown>(
	name: string,
	args: Record<string, unknown>,
) => {
	const client = getClient();
	const ref = makeFunctionReference<"query", Record<string, unknown>, T>(name);
	return client.query(ref, args);
};

export const convexMutation = async <T = unknown>(
	name: string,
	args: Record<string, unknown>,
) => {
	const client = getClient();
	const ref = makeFunctionReference<"mutation", Record<string, unknown>, T>(
		name,
	);
	return client.mutation(ref, args);
};
