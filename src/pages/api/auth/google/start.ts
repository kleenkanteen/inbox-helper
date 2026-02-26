import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

import { enforceRateLimit } from "#/server/convex/rate-limit";
import { requireUser } from "#/server/inbox/auth";
import { buildGoogleConsentUrl } from "#/server/inbox/gmail";

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
			route: "google_start",
			userId,
			limit: 20,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return res.status(429).json({ error: "Rate limit exceeded" });
		}

		const state = randomUUID();
		const url = buildGoogleConsentUrl(state);
		return res.status(200).json({ url });
	} catch {
		return res.status(401).json({ error: "Unauthorized" });
	}
}
