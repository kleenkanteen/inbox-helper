import { classifyThreads } from "../../src/server/inbox/classifier";
import type { BucketDefinition, ThreadSummary } from "../../src/server/inbox/types";
import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { enforceRateLimit, getUserFromRequest, jsonHeaders } from "./shared";

export const postClassifyHandler = httpAction(async (ctx, request) => {
	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "classify_post",
			userId,
			limit: 20,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const payload = (await ctx.runQuery(api.inbox.getThreadsAndBuckets, {
			userId,
		})) as {
			buckets: BucketDefinition[];
			threads: ThreadSummary[];
		};
		const classifications = payload.threads.length
			? await classifyThreads(payload.threads, payload.buckets)
			: [];

		if (classifications.length > 0) {
			await ctx.runMutation(api.inbox.upsertCachedClassifications, {
				userId,
				entries: classifications.map((classification) => ({
					emailId: classification.threadId,
					bucketId: classification.bucketId,
					confidence: classification.confidence,
					reason: classification.reason,
				})),
			});
		}

		await ctx.runMutation(api.inbox.saveClassifications, {
			userId,
			classifications,
		});
		const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });
		return new Response(JSON.stringify(inbox), {
			status: 200,
			headers: jsonHeaders,
		});
	} catch {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: jsonHeaders,
		});
	}
});
