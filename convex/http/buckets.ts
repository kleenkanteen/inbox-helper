import { z } from "zod";
import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";
import {
	bucketSchema,
	deleteBucketSchema,
	enforceRateLimit,
	getUserFromRequest,
	jsonHeaders,
	updateBucketSchema,
} from "./shared";

export const postBucketsHandler = httpAction(async (ctx, request) => {
	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "buckets_post",
			userId,
			limit: 15,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const body = (await request.json()) as unknown;
		const payload = bucketSchema.parse(body);
		await ctx.runMutation(api.inbox.addBucket, {
			userId,
			name: payload.name,
			description: payload.description,
		});
		const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });
		return new Response(JSON.stringify(inbox), {
			status: 200,
			headers: jsonHeaders,
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return new Response(JSON.stringify({ error: error.flatten() }), {
				status: 400,
				headers: jsonHeaders,
			});
		}
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: jsonHeaders,
		});
	}
});

export const putBucketsHandler = httpAction(async (ctx, request) => {
	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "buckets_post",
			userId,
			limit: 15,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const body = (await request.json()) as unknown;
		const payload = updateBucketSchema.parse(body);
		await ctx.runMutation(api.inbox.updateBucket, {
			userId,
			bucketId: payload.id,
			name: payload.name,
			description: payload.description,
		});
		const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });
		return new Response(JSON.stringify(inbox), {
			status: 200,
			headers: jsonHeaders,
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return new Response(JSON.stringify({ error: error.flatten() }), {
				status: 400,
				headers: jsonHeaders,
			});
		}
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: jsonHeaders,
		});
	}
});

export const deleteBucketsHandler = httpAction(async (ctx, request) => {
	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "buckets_post",
			userId,
			limit: 15,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const body = (await request.json()) as unknown;
		const payload = deleteBucketSchema.parse(body);
		await ctx.runMutation(api.inbox.deleteBucket, {
			userId,
			bucketId: payload.id,
		});
		const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });
		return new Response(JSON.stringify(inbox), {
			status: 200,
			headers: jsonHeaders,
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return new Response(JSON.stringify({ error: error.flatten() }), {
				status: 400,
				headers: jsonHeaders,
			});
		}
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: jsonHeaders,
		});
	}
});
