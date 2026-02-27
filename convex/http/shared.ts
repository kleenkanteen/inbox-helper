import { z } from "zod";
import { auth } from "../../src/server/better-auth";
import { api } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

export const bucketSchema = z.object({
	name: z.string().min(2).max(60),
	description: z.string().max(240).optional(),
});

export const updateBucketSchema = bucketSchema.extend({
	id: z.string().min(1),
});

export const deleteBucketSchema = z.object({
	id: z.string().min(1),
});

export const checkNewSchema = z.object({
	knownIds: z.array(z.string()).max(200),
});

export const chatSearchSchema = z.object({
	query: z.string().trim().min(2).max(500),
	limit: z.number().int().min(1).max(50).optional(),
});

export const messageDetailSchema = z.object({
	id: z.string().trim().min(1),
});

export const jsonHeaders = {
	"Content-Type": "application/json",
	"Access-Control-Allow-Origin": "*",
};

export const redirect = (location: string) =>
	new Response(null, {
		status: 302,
		headers: {
			Location: location,
			"Access-Control-Allow-Origin": "*",
		},
	});

export const getReturnOrigin = (
	value: string | null | undefined,
): string | null => {
	if (!value) {
		return null;
	}

	try {
		const parsed = new URL(value);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		return parsed.origin;
	} catch {
		return null;
	}
};

export const buildAppRedirect = (
	request: Request,
	pathAndQuery = "/",
	state?: { returnOrigin?: string },
) => {
	const fromState = getReturnOrigin(state?.returnOrigin);
	if (fromState) {
		return `${fromState}${pathAndQuery}`;
	}

	const fromOrigin = getReturnOrigin(request.headers.get("origin"));
	if (fromOrigin) {
		return `${fromOrigin}${pathAndQuery}`;
	}

	return pathAndQuery;
};

export const parseOAuthState = (
	state: string | null,
): { userId?: string; returnOrigin?: string } => {
	if (!state) {
		return {};
	}

	try {
		const parsed = JSON.parse(base64UrlDecode(state)) as {
			userId?: string;
			returnOrigin?: string;
		};
		return {
			...(parsed.userId ? { userId: parsed.userId } : {}),
			...(parsed.returnOrigin ? { returnOrigin: parsed.returnOrigin } : {}),
		};
	} catch {
		return {};
	}
};

export const encodeOAuthState = (state: {
	userId: string;
	returnOrigin?: string;
}) => base64UrlEncode(JSON.stringify(state));

const base64UrlEncode = (value: string) =>
	btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const base64UrlDecode = (value: string) => {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4;
	const padded =
		padding === 0
			? normalized
			: normalized.padEnd(normalized.length + (4 - padding), "=");
	return atob(padded);
};

export const getUserFromRequest = async (request: Request) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return {
			userId: session?.user?.id ?? "local-user",
			session,
		};
	} catch {
		return {
			userId: "local-user",
			session: null,
		};
	}
};

export const enforceRateLimit = async (
	ctx: ActionCtx,
	{
		route,
		userId,
		limit,
		windowMs,
	}: {
		route: string;
		userId: string;
		limit: number;
		windowMs: number;
	},
) =>
	ctx.runMutation(api.rateLimit.consume, {
		key: `${route}:${userId}`,
		limit,
		windowMs,
	});

export const compareThreadRecency = (
	left: { id: string; receivedAt?: number },
	right: { id: string; receivedAt?: number },
) => {
	const leftTime = typeof left.receivedAt === "number" ? left.receivedAt : 0;
	const rightTime = typeof right.receivedAt === "number" ? right.receivedAt : 0;
	if (leftTime !== rightTime) {
		return rightTime - leftTime;
	}
	return left.id.localeCompare(right.id);
};
