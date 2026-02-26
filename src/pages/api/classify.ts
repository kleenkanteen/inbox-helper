import type { NextApiRequest, NextApiResponse } from "next";

import { convexMutation, convexQuery } from "#/server/convex/client";
import { enforceRateLimit } from "#/server/convex/rate-limit";
import { requireUser } from "#/server/inbox/auth";
import { classifyUnseenThreads } from "#/server/inbox/classification-cache";
import type { BucketDefinition, ThreadSummary } from "#/server/inbox/types";

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
			route: "classify_post",
			userId,
			limit: 20,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return res.status(429).json({ error: "Rate limit exceeded" });
		}

		const payload = (await convexQuery("inbox:getThreadsAndBuckets", {
			userId,
		})) as {
			buckets: BucketDefinition[];
			threads: ThreadSummary[];
		};
		const classifications = await classifyUnseenThreads({
			userId,
			threads: payload.threads,
			buckets: payload.buckets,
		});
		await convexMutation("inbox:saveClassifications", {
			userId,
			classifications,
		});
		const inbox = await convexQuery("inbox:getInbox", { userId });

		return res.status(200).json(inbox);
	} catch {
		return res.status(401).json({ error: "Unauthorized" });
	}
}
