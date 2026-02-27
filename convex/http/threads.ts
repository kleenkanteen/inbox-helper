import { classifyThreads } from "../../src/server/inbox/classifier";
import { listRecentMessages } from "../../src/server/inbox/gmail";
import type {
	BucketDefinition,
	GoogleOAuthToken,
	ThreadClassification,
	ThreadSummary,
} from "../../src/server/inbox/types";
import { api } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { httpAction } from "../_generated/server";
import { enforceRateLimit, getUserFromRequest, jsonHeaders } from "./shared";

const classifyUnseenThreads = async ({
	ctx,
	userId,
	threads,
	buckets,
}: {
	ctx: ActionCtx;
	userId: string;
	threads: ThreadSummary[];
	buckets: BucketDefinition[];
}): Promise<ThreadClassification[]> => {
	const uniqueEmailIds = [...new Set(threads.map((thread) => thread.id))];
	const cached = (await ctx.runQuery(api.inbox.getCachedClassifications, {
		userId,
		emailIds: uniqueEmailIds,
	})) as Array<{
		emailId: string;
		bucketId: string;
		confidence: number;
		reason?: string;
	}>;

	const validBucketIds = new Set(buckets.map((bucket) => bucket.id));
	const cacheByEmailId = new Map(
		cached
			.filter((entry) => validBucketIds.has(entry.bucketId))
			.map((entry) => [entry.emailId, entry] as const),
	);

	const seen: ThreadClassification[] = [];
	const unseen: ThreadSummary[] = [];

	for (const thread of threads) {
		const cachedEntry = cacheByEmailId.get(thread.id);
		if (!cachedEntry) {
			unseen.push(thread);
			continue;
		}

		seen.push({
			threadId: thread.id,
			bucketId: cachedEntry.bucketId,
			confidence: cachedEntry.confidence,
			reason: cachedEntry.reason,
		});
	}

	const newlyClassified = unseen.length
		? await classifyThreads(unseen, buckets)
		: [];

	if (newlyClassified.length > 0) {
		await ctx.runMutation(api.inbox.upsertCachedClassifications, {
			userId,
			entries: newlyClassified.map((classification) => ({
				emailId: classification.threadId,
				bucketId: classification.bucketId,
				confidence: classification.confidence,
				reason: classification.reason,
			})),
		});
	}

	const classificationByThreadId = new Map(
		[...seen, ...newlyClassified].map((classification) => [
			classification.threadId,
			classification,
		]),
	);

	return threads.map((thread) => {
		const classification = classificationByThreadId.get(thread.id);
		if (!classification) {
			const fallbackBucketId =
				buckets.find((bucket) => bucket.name === "Can Wait")?.id ??
				buckets[0]?.id;
			if (!fallbackBucketId) {
				throw new Error(`Missing classification for thread ${thread.id}`);
			}

			return {
				threadId: thread.id,
				bucketId: fallbackBucketId,
				confidence: 0.1,
				reason: "Fallback assignment due to missing classification.",
			};
		}
		return classification;
	});
};

export const getThreadsHandler = httpAction(async (ctx, request) => {
	const limit = 200;
	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "threads_get",
			userId,
			limit: 30,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const buckets = (await ctx.runMutation(api.inbox.ensureDefaultBuckets, {
			userId,
		})) as BucketDefinition[];
		const token = (await ctx.runQuery(api.inbox.getGoogleToken, {
			userId,
		})) as GoogleOAuthToken | null;

		if (!token) {
			return new Response(
				JSON.stringify({
					error: "Google account is not connected",
					needsGoogleAuth: true,
				}),
				{
					status: 400,
					headers: jsonHeaders,
				},
			);
		}

		let threads: ThreadSummary[];
		try {
			threads = await listRecentMessages(token, limit);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to fetch Gmail messages";
			console.error("[/api/threads] STEP 6 FAILED: listRecentMessages", {
				message,
				error,
			});
			if (
				message.includes("Failed to fetch Gmail messages: 401") ||
				message.includes("Failed to fetch Gmail messages: 403")
			) {
				return new Response(
					JSON.stringify({
						error: "Gmail authorization expired. Please sign in again.",
						needsGoogleAuth: true,
					}),
					{
						status: 400,
						headers: jsonHeaders,
					},
				);
			}
			throw error;
		}

		const classifications = await classifyUnseenThreads({
			ctx,
			userId,
			threads,
			buckets,
		});
		await ctx.runMutation(api.inbox.saveThreadsAndClassifications, {
			userId,
			threads,
			classifications,
		});
		const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });

		return new Response(JSON.stringify({ limit, ...inbox }), {
			status: 200,
			headers: jsonHeaders,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to load inbox";
		console.error("[/api/threads] STEP FAILED: unhandled error", {
			message,
			error,
		});
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: jsonHeaders,
		});
	}
});
