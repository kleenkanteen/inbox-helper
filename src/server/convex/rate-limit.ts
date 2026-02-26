import { convexMutation } from "#/server/convex/client";

export const enforceRateLimit = async ({
	route,
	userId,
	limit,
	windowMs,
}: {
	route: string;
	userId: string;
	limit: number;
	windowMs: number;
}) => {
	const result = await convexMutation<{
		allowed: boolean;
		remaining: number;
		resetAt: number;
	}>("rateLimit:consume", {
		key: `${route}:${userId}`,
		limit,
		windowMs,
	});
	return result;
};
