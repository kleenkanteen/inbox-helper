import type { NextApiRequest, NextApiResponse } from "next";

import { convexMutation, convexQuery } from "#/server/convex/client";
import { enforceRateLimit } from "#/server/convex/rate-limit";
import { requireUser } from "#/server/inbox/auth";
import { classifyThreads } from "#/server/inbox/classifier";
import { listRecentThreads } from "#/server/inbox/gmail";
import type { BucketDefinition, GoogleOAuthToken } from "#/server/inbox/types";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		return res.status(405).json({ error: "Method Not Allowed" });
	}

	const limit = Number(req.query.limit ?? "200");

	try {
		const { userId } = await requireUser(req);
		const rateLimit = await enforceRateLimit({
			route: "threads_get",
			userId,
			limit: 30,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return res.status(429).json({ error: "Rate limit exceeded" });
		}

		const buckets = (await convexMutation("inbox:ensureDefaultBuckets", {
			userId,
		})) as BucketDefinition[];
		const token = (await convexQuery("inbox:getGoogleToken", {
			userId,
		})) as GoogleOAuthToken | null;

		if (!token) {
			return res.status(400).json({
				error: "Google account is not connected",
				needsGoogleAuth: true,
			});
		}

		const threads = await listRecentThreads(token, limit);
		const classifications = await classifyThreads(threads, buckets);
		await convexMutation("inbox:saveThreadsAndClassifications", {
			userId,
			threads,
			classifications,
		});
		const inbox = await convexQuery("inbox:getInbox", { userId });

		return res.status(200).json({
			limit,
			...(inbox as object),
		});
	} catch {
		return res.status(401).json({ error: "Unauthorized" });
	}
}
