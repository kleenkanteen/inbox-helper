import {
	mutationGeneric as mutation,
	queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";

const DEFAULT_BUCKETS = [
	{
		name: "Important",
		type: "default" as const,
		description: "Actionable or urgent conversations.",
	},
	{
		name: "Can Wait",
		type: "default" as const,
		description: "Useful updates that are not urgent.",
	},
	{
		name: "Auto-Archive",
		type: "default" as const,
		description: "Low-value notifications that can be archived.",
	},
	{
		name: "Newsletter",
		type: "default" as const,
		description: "Subscriptions, digests, and marketing content.",
	},
];

const MAX_STORED_THREADS = 200;

const compareThreadRecency = (
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

const ensureDefaults = async (ctx: any, userId: string) => {
	const existing = await ctx.db
		.query("bucketDefinitions")
		.withIndex("by_user", (q: any) => q.eq("userId", userId))
		.collect();
	if (existing.length > 0) {
		return existing;
	}
	const now = Date.now();
	for (const bucket of DEFAULT_BUCKETS) {
		await ctx.db.insert("bucketDefinitions", {
			userId,
			name: bucket.name,
			type: bucket.type,
			description: bucket.description,
			createdAt: now,
		});
	}
	return await ctx.db
		.query("bucketDefinitions")
		.withIndex("by_user", (q: any) => q.eq("userId", userId))
		.collect();
};

export const ensureDefaultBuckets = mutation({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const buckets = await ensureDefaults(ctx, args.userId);
		return buckets.map((bucket: any) => ({
			id: String(bucket._id),
			name: bucket.name,
			type: bucket.type,
			description: bucket.description,
		}));
	},
});

export const saveGoogleToken = mutation({
	args: {
		userId: v.string(),
		token: v.object({
			accessToken: v.string(),
			refreshToken: v.optional(v.string()),
			expiresAt: v.optional(v.number()),
			scope: v.optional(v.string()),
			tokenType: v.optional(v.string()),
		}),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("oauthTokens")
			.withIndex("by_user", (q: any) => q.eq("userId", args.userId))
			.first();

		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				accessToken: args.token.accessToken,
				...(args.token.refreshToken
					? { refreshToken: args.token.refreshToken }
					: {}),
				...(args.token.expiresAt ? { expiresAt: args.token.expiresAt } : {}),
				...(args.token.scope ? { scope: args.token.scope } : {}),
				...(args.token.tokenType ? { tokenType: args.token.tokenType } : {}),
				updatedAt: now,
			});
			return existing._id;
		}
		return ctx.db.insert("oauthTokens", {
			userId: args.userId,
			accessToken: args.token.accessToken,
			...(args.token.refreshToken
				? { refreshToken: args.token.refreshToken }
				: {}),
			...(args.token.expiresAt ? { expiresAt: args.token.expiresAt } : {}),
			...(args.token.scope ? { scope: args.token.scope } : {}),
			...(args.token.tokenType ? { tokenType: args.token.tokenType } : {}),
			updatedAt: now,
		});
	},
});

export const getGoogleToken = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const token = await ctx.db
			.query("oauthTokens")
			.withIndex("by_user", (q: any) => q.eq("userId", args.userId))
			.first();
		if (!token) {
			return null;
		}
		return {
			accessToken: token.accessToken,
			refreshToken: token.refreshToken,
			expiresAt: token.expiresAt,
			scope: token.scope,
			tokenType: token.tokenType,
		};
	},
});

export const deleteGoogleToken = mutation({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const token = await ctx.db
			.query("oauthTokens")
			.withIndex("by_user", (q: any) => q.eq("userId", args.userId))
			.first();
		if (!token) {
			return null;
		}
		await ctx.db.delete(token._id);
		return token._id;
	},
});

export const getThreadsAndBuckets = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const buckets = await ensureDefaults(ctx, args.userId);
		const threads = await ctx.db
			.query("threadSnapshots")
			.withIndex("by_user_thread", (q: any) => q.eq("userId", args.userId))
			.collect();
		return {
			buckets: buckets.map((bucket: any) => ({
				id: String(bucket._id),
				name: bucket.name,
				type: bucket.type,
				description: bucket.description,
			})),
			threads: threads.map((thread: any) => ({
				id: thread.threadId,
				subject: thread.subject,
				snippet: thread.snippet,
				receivedAt: thread.receivedAt,
				sender: thread.sender,
			})),
		};
	},
});

export const getCachedClassifications = query({
	args: {
		userId: v.string(),
		emailIds: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const uniqueEmailIds = [...new Set(args.emailIds)];
		const results: Array<{
			emailId: string;
			bucketId: string;
			confidence: number;
			reason?: string;
		}> = [];

		for (const emailId of uniqueEmailIds) {
			const cached = await ctx.db
				.query("emailClassificationCache")
				.withIndex("by_user_email", (q: any) =>
					q.eq("userId", args.userId).eq("emailId", emailId),
				)
				.first();
			if (!cached) {
				continue;
			}
			results.push({
				emailId: cached.emailId,
				bucketId: cached.bucketId,
				confidence: cached.confidence,
				reason: cached.reason,
			});
		}

		return results;
	},
});

export const saveThreadsAndClassifications = mutation({
	args: {
		userId: v.string(),
		threads: v.array(
			v.object({
				id: v.string(),
				subject: v.string(),
				snippet: v.string(),
				receivedAt: v.optional(v.number()),
				sender: v.optional(v.string()),
			}),
		),
		classifications: v.array(
			v.object({
				threadId: v.string(),
				bucketId: v.string(),
				confidence: v.number(),
				reason: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const newestThreads = [...args.threads]
			.sort((left, right) =>
				compareThreadRecency(
					{ id: left.id, receivedAt: left.receivedAt },
					{ id: right.id, receivedAt: right.receivedAt },
				),
			)
			.slice(0, MAX_STORED_THREADS);
		const newestThreadIdSet = new Set(newestThreads.map((thread) => thread.id));
		const newestClassifications = args.classifications.filter(
			(classification) => newestThreadIdSet.has(classification.threadId),
		);

		const oldThreads = await ctx.db
			.query("threadSnapshots")
			.withIndex("by_user_thread", (q: any) => q.eq("userId", args.userId))
			.collect();
		for (const thread of oldThreads) {
			await ctx.db.delete(thread._id);
		}

		for (const thread of newestThreads) {
			const normalizedSnippet =
				typeof thread.snippet === "string" && thread.snippet.trim().length > 0
					? thread.snippet
					: "(No preview available)";
			await ctx.db.insert("threadSnapshots", {
				userId: args.userId,
				threadId: thread.id,
				subject: thread.subject,
				snippet: normalizedSnippet,
				...(typeof thread.receivedAt === "number"
					? { receivedAt: thread.receivedAt }
					: {}),
				...(thread.sender ? { sender: thread.sender } : {}),
				updatedAt: now,
			});
		}

		const oldClassifications = await ctx.db
			.query("threadClassifications")
			.withIndex("by_user_thread", (q: any) => q.eq("userId", args.userId))
			.collect();
		for (const classification of oldClassifications) {
			await ctx.db.delete(classification._id);
		}

		for (const classification of newestClassifications) {
			await ctx.db.insert("threadClassifications", {
				userId: args.userId,
				threadId: classification.threadId,
				bucketId: classification.bucketId,
				confidence: classification.confidence,
				...(classification.reason ? { reason: classification.reason } : {}),
				updatedAt: now,
			});
		}
	},
});

export const saveClassifications = mutation({
	args: {
		userId: v.string(),
		classifications: v.array(
			v.object({
				threadId: v.string(),
				bucketId: v.string(),
				confidence: v.number(),
				reason: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const oldClassifications = await ctx.db
			.query("threadClassifications")
			.withIndex("by_user_thread", (q: any) => q.eq("userId", args.userId))
			.collect();
		for (const classification of oldClassifications) {
			await ctx.db.delete(classification._id);
		}

		for (const classification of args.classifications) {
			await ctx.db.insert("threadClassifications", {
				userId: args.userId,
				threadId: classification.threadId,
				bucketId: classification.bucketId,
				confidence: classification.confidence,
				...(classification.reason ? { reason: classification.reason } : {}),
				updatedAt: now,
			});
		}
	},
});

export const upsertCachedClassifications = mutation({
	args: {
		userId: v.string(),
		entries: v.array(
			v.object({
				emailId: v.string(),
				bucketId: v.string(),
				confidence: v.number(),
				reason: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const uniqueEntries = new Map<
			string,
			{
				bucketId: string;
				confidence: number;
				reason?: string;
			}
		>();

		for (const entry of args.entries) {
			uniqueEntries.set(entry.emailId, {
				bucketId: entry.bucketId,
				confidence: entry.confidence,
				reason: entry.reason,
			});
		}

		for (const [emailId, value] of uniqueEntries.entries()) {
			const existing = await ctx.db
				.query("emailClassificationCache")
				.withIndex("by_user_email", (q: any) =>
					q.eq("userId", args.userId).eq("emailId", emailId),
				)
				.first();

			if (existing) {
				await ctx.db.patch(existing._id, {
					bucketId: value.bucketId,
					confidence: value.confidence,
					...(value.reason ? { reason: value.reason } : {}),
					updatedAt: now,
				});
				continue;
			}

			await ctx.db.insert("emailClassificationCache", {
				userId: args.userId,
				emailId,
				bucketId: value.bucketId,
				confidence: value.confidence,
				...(value.reason ? { reason: value.reason } : {}),
				updatedAt: now,
			});
		}
	},
});

export const addBucket = mutation({
	args: {
		userId: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ensureDefaults(ctx, args.userId);
		return ctx.db.insert("bucketDefinitions", {
			userId: args.userId,
			name: args.name,
			type: "custom",
			...(args.description ? { description: args.description } : {}),
			createdAt: Date.now(),
		});
	},
});

export const updateBucket = mutation({
	args: {
		userId: v.string(),
		bucketId: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ensureDefaults(ctx, args.userId);
		const bucket = await ctx.db.get(args.bucketId as any);
		if (!bucket || bucket.userId !== args.userId) {
			throw new Error("Bucket not found");
		}

		await ctx.db.patch(bucket._id, {
			name: args.name,
			description: args.description,
		});
	},
});

export const deleteBucket = mutation({
	args: {
		userId: v.string(),
		bucketId: v.string(),
	},
	handler: async (ctx, args) => {
		await ensureDefaults(ctx, args.userId);
		const bucket = await ctx.db.get(args.bucketId as any);
		if (!bucket || bucket.userId !== args.userId) {
			throw new Error("Bucket not found");
		}

		const allBuckets = await ctx.db
			.query("bucketDefinitions")
			.withIndex("by_user", (q: any) => q.eq("userId", args.userId))
			.collect();
		if (allBuckets.length <= 1) {
			throw new Error("Cannot delete the last category");
		}

		await ctx.db.delete(bucket._id);
	},
});

export const getInbox = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const buckets = await ensureDefaults(ctx, args.userId);
		const threads = await ctx.db
			.query("threadSnapshots")
			.withIndex("by_user_thread", (q: any) => q.eq("userId", args.userId))
			.collect();
		const classifications = await ctx.db
			.query("threadClassifications")
			.withIndex("by_user_thread", (q: any) => q.eq("userId", args.userId))
			.collect();

		const threadMap = new Map(
			threads.map((thread: any) => [thread.threadId, thread]),
		);
		const assignedThreadIds = new Set<string>();
		const canWaitBucketId =
			buckets.find((bucket: any) => bucket.name === "Can Wait")?._id ??
			buckets[0]?._id;
		const grouped = new Map<
			string,
			{
				bucket: {
					id: string;
					name: string;
					type: "default" | "custom";
					description?: string;
				};
				threads: Array<{
					id: string;
					subject: string;
					snippet: string;
					receivedAt?: number;
					confidence: number;
				}>;
			}
		>(
			buckets.map((bucket: any) => [
				String(bucket._id),
				{
					bucket: {
						id: String(bucket._id),
						name: bucket.name,
						type: bucket.type,
						description: bucket.description,
					},
					threads: [],
				},
			]),
		);

		for (const classification of classifications) {
			const thread = threadMap.get(classification.threadId);
			const target = grouped.get(classification.bucketId);
			if (!thread || !target) {
				continue;
			}
			assignedThreadIds.add(thread.threadId);
			target.threads.push({
				id: thread.threadId,
				subject: thread.subject,
				snippet:
					typeof thread.snippet === "string" && thread.snippet.trim().length > 0
						? thread.snippet
						: "(No preview available)",
				receivedAt: thread.receivedAt,
				confidence: classification.confidence,
			});
		}

		// Backstop: keep threads visible even if a classification is missing/invalid.
		const fallbackGroup = canWaitBucketId
			? grouped.get(String(canWaitBucketId))
			: undefined;
		if (fallbackGroup) {
			for (const thread of threads) {
				if (assignedThreadIds.has(thread.threadId)) {
					continue;
				}
				fallbackGroup.threads.push({
					id: thread.threadId,
					subject: thread.subject,
					snippet:
						typeof thread.snippet === "string" &&
						thread.snippet.trim().length > 0
							? thread.snippet
							: "(No preview available)",
					receivedAt: thread.receivedAt,
					confidence: 0,
				});
			}
		}

		for (const group of grouped.values()) {
			group.threads.sort(compareThreadRecency);
		}

		return {
			buckets: buckets.map((bucket: any) => ({
				id: String(bucket._id),
				name: bucket.name,
				type: bucket.type,
				description: bucket.description,
			})),
			grouped: [...grouped.values()],
		};
	},
});
