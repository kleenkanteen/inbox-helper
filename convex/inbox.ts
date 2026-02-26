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

const ensureDefaults = async (ctx: any, userId: string) => {
	const existing = (await ctx.db.query("bucketDefinitions").collect()).filter(
		(bucket: { userId: string }) => bucket.userId === userId,
	);
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
	return (await ctx.db.query("bucketDefinitions").collect()).filter(
		(bucket: { userId: string }) => bucket.userId === userId,
	);
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
		const existing = (await ctx.db.query("oauthTokens").collect()).find(
			(token: { userId: string }) => token.userId === args.userId,
		);

		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				...args.token,
				updatedAt: now,
			});
			return existing._id;
		}
		return ctx.db.insert("oauthTokens", {
			userId: args.userId,
			...args.token,
			updatedAt: now,
		});
	},
});

export const getGoogleToken = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const token = (await ctx.db.query("oauthTokens").collect()).find(
			(entry: { userId: string }) => entry.userId === args.userId,
		);
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

export const getThreadsAndBuckets = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const buckets = await ensureDefaults(ctx, args.userId);
		const threads = (await ctx.db.query("threadSnapshots").collect()).filter(
			(thread: { userId: string }) => thread.userId === args.userId,
		);
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
				sender: thread.sender,
			})),
		};
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
		const oldThreads = (await ctx.db.query("threadSnapshots").collect()).filter(
			(thread: { userId: string }) => thread.userId === args.userId,
		);
		for (const thread of oldThreads) {
			await ctx.db.delete(thread._id);
		}

		for (const thread of args.threads) {
			await ctx.db.insert("threadSnapshots", {
				userId: args.userId,
				threadId: thread.id,
				subject: thread.subject,
				snippet: thread.snippet,
				sender: thread.sender,
				updatedAt: now,
			});
		}

		const oldClassifications = (
			await ctx.db.query("threadClassifications").collect()
		).filter(
			(classification: { userId: string }) =>
				classification.userId === args.userId,
		);
		for (const classification of oldClassifications) {
			await ctx.db.delete(classification._id);
		}

		for (const classification of args.classifications) {
			await ctx.db.insert("threadClassifications", {
				userId: args.userId,
				threadId: classification.threadId,
				bucketId: classification.bucketId,
				confidence: classification.confidence,
				reason: classification.reason,
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
		const oldClassifications = (
			await ctx.db.query("threadClassifications").collect()
		).filter(
			(classification: { userId: string }) =>
				classification.userId === args.userId,
		);
		for (const classification of oldClassifications) {
			await ctx.db.delete(classification._id);
		}

		for (const classification of args.classifications) {
			await ctx.db.insert("threadClassifications", {
				userId: args.userId,
				threadId: classification.threadId,
				bucketId: classification.bucketId,
				confidence: classification.confidence,
				reason: classification.reason,
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
			description: args.description,
			createdAt: Date.now(),
		});
	},
});

export const getInbox = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const buckets = await ensureDefaults(ctx, args.userId);
		const threads = (await ctx.db.query("threadSnapshots").collect()).filter(
			(thread: { userId: string }) => thread.userId === args.userId,
		);
		const classifications = (
			await ctx.db.query("threadClassifications").collect()
		).filter(
			(classification: { userId: string }) =>
				classification.userId === args.userId,
		);

		const threadMap = new Map(
			threads.map((thread: any) => [thread.threadId, thread]),
		);
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
			target.threads.push({
				id: thread.threadId,
				subject: thread.subject,
				snippet: thread.snippet,
				confidence: classification.confidence,
			});
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
