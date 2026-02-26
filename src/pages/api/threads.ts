import type { NextApiRequest, NextApiResponse } from "next";

import { convexMutation, convexQuery } from "#/server/convex/client";
import { enforceRateLimit } from "#/server/convex/rate-limit";
import { requireUser } from "#/server/inbox/auth";
import { classifyUnseenThreads } from "#/server/inbox/classification-cache";
import { listRecentMessages } from "#/server/inbox/gmail";
import type { BucketDefinition, GoogleOAuthToken } from "#/server/inbox/types";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		return res.status(405).json({ error: "Method Not Allowed" });
	}

	const limit = 200;
	const withStage = async <T>(stage: string, work: () => Promise<T>) => {
		try {
			return await work();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown error";
			throw new Error(`${stage}: ${message}`);
		}
	};

	try {
		const { userId } = await withStage("require_user", async () =>
			requireUser(req),
		);
		const rateLimit = await withStage("rate_limit", async () =>
			enforceRateLimit({
				route: "threads_get",
				userId,
				limit: 30,
				windowMs: 60_000,
			}),
		);
		if (!rateLimit.allowed) {
			return res.status(429).json({ error: "Rate limit exceeded" });
		}

		const buckets = (await withStage("ensure_default_buckets", async () =>
			convexMutation("inbox:ensureDefaultBuckets", {
				userId,
			}),
		)) as BucketDefinition[];
		const token = (await withStage("get_google_token", async () =>
			convexQuery("inbox:getGoogleToken", {
				userId,
			}),
		)) as GoogleOAuthToken | null;

		if (!token) {
			return res.status(400).json({
				error: "Google account is not connected",
				needsGoogleAuth: true,
			});
		}

		let threads;
		try {
			threads = await listRecentMessages(token, limit);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to fetch Gmail messages";
			if (
				message.includes("Failed to fetch Gmail messages: 401") ||
				message.includes("Failed to fetch Gmail messages: 403")
			) {
				return res.status(400).json({
					error: "Gmail authorization expired. Please sign in again.",
					needsGoogleAuth: true,
				});
			}
			throw error;
		}
		const classifications = await withStage("classify_unseen_threads", async () =>
			classifyUnseenThreads({
				userId,
				threads,
				buckets,
			}),
		);
		await withStage("save_threads_and_classifications", async () =>
			convexMutation("inbox:saveThreadsAndClassifications", {
				userId,
				threads,
				classifications,
			}),
		);
		const inbox = await withStage("get_inbox", async () =>
			convexQuery("inbox:getInbox", { userId }),
		);

		return res.status(200).json({
			limit,
			...(inbox as object),
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to load inbox";
		return res.status(500).json({ error: message });
	}
}
