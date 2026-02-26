import type { NextApiRequest, NextApiResponse } from "next";

import { convexMutation } from "#/server/convex/client";
import { requireUser } from "#/server/inbox/auth";

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
		await convexMutation("inbox:deleteGoogleToken", { userId });
		return res.status(200).json({ ok: true });
	} catch {
		return res.status(401).json({ error: "Unauthorized" });
	}
}
