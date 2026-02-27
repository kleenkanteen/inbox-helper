import { z } from "zod";
import { searchRelevantThreads } from "../../src/server/inbox/classifier";
import type { ThreadSummary } from "../../src/server/inbox/types";
import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";
import {
	chatSearchSchema,
	compareThreadRecency,
	enforceRateLimit,
	getUserFromRequest,
	jsonHeaders,
} from "./shared";

export const postChatSearchHandler = httpAction(async (ctx, request) => {
	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "chat_search_post",
			userId,
			limit: 30,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const body = (await request.json()) as unknown;
		const payload = chatSearchSchema.parse(body);

		const stored = (await ctx.runQuery(api.inbox.getThreadsAndBuckets, {
			userId,
		})) as {
			threads: ThreadSummary[];
		};

		const threads = [...stored.threads].sort(compareThreadRecency).slice(0, 200);
		const matchedIds = await searchRelevantThreads({
			query: payload.query,
			threads,
			limit: payload.limit ?? 15,
		});
		const threadById = new Map(threads.map((thread) => [thread.id, thread]));
		const results = matchedIds
			.map((id) => threadById.get(id))
			.filter((thread): thread is ThreadSummary => Boolean(thread))
			.map((thread) => ({
				id: thread.id,
				subject: thread.subject,
				snippet: thread.snippet,
				sender: thread.sender,
				receivedAt: thread.receivedAt,
			}));

		return new Response(
			JSON.stringify({
				query: payload.query,
				totalCandidates: threads.length,
				results,
			}),
			{
				status: 200,
				headers: jsonHeaders,
			},
		);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return new Response(JSON.stringify({ error: error.flatten() }), {
				status: 400,
				headers: jsonHeaders,
			});
		}
		const message =
			error instanceof Error ? error.message : "Failed to search chat";
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: jsonHeaders,
		});
	}
});
