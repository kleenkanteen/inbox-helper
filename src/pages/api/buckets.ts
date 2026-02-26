import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { convexMutation, convexQuery } from "#/server/convex/client";
import { enforceRateLimit } from "#/server/convex/rate-limit";
import { requireUser } from "#/server/inbox/auth";
import { classifyAllThreads } from "#/server/inbox/classification-cache";
import type { BucketDefinition, ThreadSummary } from "#/server/inbox/types";

const schema = z.object({
	name: z.string().min(2).max(60),
	description: z.string().max(240).optional(),
});
const updateSchema = schema.extend({
	id: z.string().min(1),
});
const deleteSchema = z.object({
	id: z.string().min(1),
});

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (!["POST", "PUT", "DELETE"].includes(req.method ?? "")) {
		res.setHeader("Allow", "POST, PUT, DELETE");
		return res.status(405).json({ error: "Method Not Allowed" });
	}

	try {
		const { userId } = await requireUser(req);
		const rateLimit = await enforceRateLimit({
			route: "buckets_post",
			userId,
			limit: 15,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return res.status(429).json({ error: "Rate limit exceeded" });
		}

		if (req.method === "POST") {
			const payload = schema.parse(req.body);
			await convexMutation("inbox:addBucket", {
				userId,
				name: payload.name,
				description: payload.description,
			});
		}

		if (req.method === "PUT") {
			const payload = updateSchema.parse(req.body);
			await convexMutation("inbox:updateBucket", {
				userId,
				bucketId: payload.id,
				name: payload.name,
				description: payload.description,
			});
		}

		if (req.method === "DELETE") {
			const payload = deleteSchema.parse(req.body);
			await convexMutation("inbox:deleteBucket", {
				userId,
				bucketId: payload.id,
			});
		}

		const data = (await convexQuery("inbox:getThreadsAndBuckets", {
			userId,
		})) as {
			buckets: BucketDefinition[];
			threads: ThreadSummary[];
		};
		const classifications = await classifyAllThreads({
			userId,
			threads: data.threads,
			buckets: data.buckets,
		});
		await convexMutation("inbox:saveClassifications", {
			userId,
			classifications,
		});
		const inbox = await convexQuery("inbox:getInbox", { userId });

		return res.status(200).json(inbox);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res.status(400).json({ error: error.flatten() });
		}
		return res.status(401).json({ error: "Unauthorized" });
	}
}
