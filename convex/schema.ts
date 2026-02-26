import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	oauthTokens: defineTable({
		userId: v.string(),
		accessToken: v.string(),
		refreshToken: v.optional(v.string()),
		expiresAt: v.optional(v.number()),
		scope: v.optional(v.string()),
		tokenType: v.optional(v.string()),
		updatedAt: v.number(),
	}).index("by_user", ["userId"]),
	bucketDefinitions: defineTable({
		userId: v.string(),
		name: v.string(),
		type: v.union(v.literal("default"), v.literal("custom")),
		description: v.optional(v.string()),
		createdAt: v.number(),
	}).index("by_user", ["userId"]),
	threadSnapshots: defineTable({
		userId: v.string(),
		threadId: v.string(),
		subject: v.string(),
		snippet: v.string(),
		sender: v.optional(v.string()),
		updatedAt: v.number(),
	}).index("by_user_thread", ["userId", "threadId"]),
	threadClassifications: defineTable({
		userId: v.string(),
		threadId: v.string(),
		bucketId: v.string(),
		confidence: v.number(),
		reason: v.optional(v.string()),
		updatedAt: v.number(),
	}).index("by_user_thread", ["userId", "threadId"]),
	rateLimits: defineTable({
		key: v.string(),
		windowStart: v.number(),
		count: v.number(),
		updatedAt: v.number(),
	}).index("by_key_window", ["key", "windowStart"]),
});
