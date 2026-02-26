import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { convexQuery } from "#/server/convex/client";
import { enforceRateLimit } from "#/server/convex/rate-limit";
import { requireUser } from "#/server/inbox/auth";
import { listRecentMessageIds } from "#/server/inbox/gmail";
import type { GoogleOAuthToken } from "#/server/inbox/types";

const schema = z.object({
	knownIds: z.array(z.string()).max(200),
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
			route: "messages_check_new_post",
			userId,
			limit: 90,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return res.status(429).json({ error: "Rate limit exceeded" });
		}

		const payload = schema.parse(req.body);
		const token = (await convexQuery("inbox:getGoogleToken", {
			userId,
		})) as GoogleOAuthToken | null;

		if (!token) {
			return res.status(200).json({
				hasNew: false,
				newCount: 0,
				latestIds: [] as string[],
				needsGoogleAuth: true,
			});
		}

		const latestIds = await listRecentMessageIds(token, 200);
		const known = new Set(payload.knownIds);
		const newIds = latestIds.filter((id) => !known.has(id));

		return res.status(200).json({
			hasNew: newIds.length > 0,
			newCount: newIds.length,
			latestIds,
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res.status(400).json({ error: error.flatten() });
		}
		return res.status(401).json({ error: "Unauthorized" });
	}
}
