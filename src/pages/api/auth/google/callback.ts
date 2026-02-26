import type { NextApiRequest, NextApiResponse } from "next";

import { convexMutation } from "#/server/convex/client";
import { enforceRateLimit } from "#/server/convex/rate-limit";
import { requireUser } from "#/server/inbox/auth";
import { exchangeCodeForGoogleToken } from "#/server/inbox/gmail";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		return res.status(405).json({ error: "Method Not Allowed" });
	}

	const code = req.query.code;
	const codeValue = Array.isArray(code) ? code[0] : code;
	if (!codeValue) {
		return res.redirect("/?error=missing_code");
	}

	try {
		const { userId } = await requireUser(req);
		const limit = await enforceRateLimit({
			route: "google_callback",
			userId,
			limit: 20,
			windowMs: 60_000,
		});
		if (!limit.allowed) {
			return res.redirect("/?error=rate_limited");
		}

		const token = await exchangeCodeForGoogleToken(codeValue);
		await convexMutation("inbox:saveGoogleToken", {
			userId,
			token,
		});
		return res.redirect("/");
	} catch {
		return res.redirect("/?error=oauth_failed");
	}
}
