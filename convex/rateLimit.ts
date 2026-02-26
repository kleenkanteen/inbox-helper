import { mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";

export const consume = mutation({
	args: {
		key: v.string(),
		limit: v.number(),
		windowMs: v.number(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const windowStart = Math.floor(now / args.windowMs) * args.windowMs;
		const existing = (await ctx.db.query("rateLimits").collect()).find(
			(entry: { key: string; windowStart: number }) =>
				entry.key === args.key && entry.windowStart === windowStart,
		);

		if (!existing) {
			await ctx.db.insert("rateLimits", {
				key: args.key,
				windowStart,
				count: 1,
				updatedAt: now,
			});
			return {
				allowed: true,
				remaining: Math.max(args.limit - 1, 0),
				resetAt: windowStart + args.windowMs,
			};
		}

		if (existing.count >= args.limit) {
			return {
				allowed: false,
				remaining: 0,
				resetAt: windowStart + args.windowMs,
			};
		}

		await ctx.db.patch(existing._id, {
			count: existing.count + 1,
			updatedAt: now,
		});

		return {
			allowed: true,
			remaining: Math.max(args.limit - existing.count - 1, 0),
			resetAt: windowStart + args.windowMs,
		};
	},
});
