import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { convexMutation, convexQuery } from "#/server/convex/client";
import { enforceRateLimit } from "#/server/convex/rate-limit";
import { requireUser } from "#/server/inbox/auth";
import { classifyThreads } from "#/server/inbox/classifier";
import type { BucketDefinition, ThreadSummary } from "#/server/inbox/types";

const schema = z.object({
	name: z.string().min(2).max(60),
	description: z.string().max(240).optional(),
});

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");
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

		const payload = schema.parse(req.body);
		await convexMutation("inbox:addBucket", {
			userId,
			name: payload.name,
			description: payload.description,
		});

		const data = (await convexQuery("inbox:getThreadsAndBuckets", {
			userId,
		})) as {
			buckets: BucketDefinition[];
			threads: ThreadSummary[];
		};
		const classifications = await classifyThreads(data.threads, data.buckets);
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
