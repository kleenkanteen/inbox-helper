import { z } from "zod";
import {
	fetchMessageDetail,
	listRecentMessageIds,
} from "../../src/server/inbox/gmail";
import type { GoogleOAuthToken } from "../../src/server/inbox/types";
import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";
import {
	checkNewSchema,
	enforceRateLimit,
	getUserFromRequest,
	jsonHeaders,
	messageDetailSchema,
} from "./shared";

export const postMessageDetailHandler = httpAction(async (ctx, request) => {
	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "message_detail_post",
			userId,
			limit: 60,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const body = (await request.json()) as unknown;
		const payload = messageDetailSchema.parse(body);
		const token = (await ctx.runQuery(api.inbox.getGoogleToken, {
			userId,
		})) as GoogleOAuthToken | null;

		if (!token) {
			return new Response(
				JSON.stringify({
					error: "Google account is not connected",
					needsGoogleAuth: true,
				}),
				{
					status: 400,
					headers: jsonHeaders,
				},
			);
		}

		const detail = await fetchMessageDetail({
			token,
			messageId: payload.id,
		});

		return new Response(JSON.stringify(detail), {
			status: 200,
			headers: jsonHeaders,
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return new Response(JSON.stringify({ error: error.flatten() }), {
				status: 400,
				headers: jsonHeaders,
			});
		}
		const message =
			error instanceof Error
				? error.message
				: "Failed to fetch message detail";
		if (
			message.includes("Failed to fetch Gmail message detail: 401") ||
			message.includes("Failed to fetch Gmail message detail: 403")
		) {
			return new Response(
				JSON.stringify({
					error: "Gmail authorization expired. Please sign in again.",
					needsGoogleAuth: true,
				}),
				{
					status: 400,
					headers: jsonHeaders,
				},
			);
		}
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: jsonHeaders,
		});
	}
});

export const postCheckNewMessagesHandler = httpAction(async (ctx, request) => {
	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "messages_check_new_post",
			userId,
			limit: 90,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const body = (await request.json()) as unknown;
		const payload = checkNewSchema.parse(body);
		const token = (await ctx.runQuery(api.inbox.getGoogleToken, {
			userId,
		})) as GoogleOAuthToken | null;

		if (!token) {
			return new Response(
				JSON.stringify({
					hasNew: false,
					newCount: 0,
					latestIds: [] as string[],
					needsGoogleAuth: true,
				}),
				{
					status: 200,
					headers: jsonHeaders,
				},
			);
		}

		const latestIds = await listRecentMessageIds(token, 200);
		const known = new Set(payload.knownIds);
		const newIds = latestIds.filter((id) => !known.has(id));

		return new Response(
			JSON.stringify({
				hasNew: newIds.length > 0,
				newCount: newIds.length,
				latestIds,
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
			error instanceof Error
				? error.message
				: "Failed to check for new messages";
		if (
			message.includes("Failed to fetch Gmail message ids: 401") ||
			message.includes("Failed to fetch Gmail message ids: 403")
		) {
			return new Response(
				JSON.stringify({
					hasNew: false,
					newCount: 0,
					latestIds: [] as string[],
					needsGoogleAuth: true,
					error: "Gmail authorization expired. Please sign in again.",
				}),
				{
					status: 200,
					headers: jsonHeaders,
				},
			);
		}

		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: jsonHeaders,
		});
	}
});
