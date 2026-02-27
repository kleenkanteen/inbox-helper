import { httpRouter } from "convex/server";
import { z } from "zod";
import { auth } from "../src/server/better-auth";
import {
	classifyThreads,
	searchRelevantThreads,
} from "../src/server/inbox/classifier";
import {
	buildGoogleConsentUrl,
	exchangeCodeForGoogleToken,
	fetchMessageDetail,
	listRecentMessageIds,
	listRecentMessages,
} from "../src/server/inbox/gmail";
import type {
	BucketDefinition,
	GoogleOAuthToken,
	ThreadClassification,
	ThreadSummary,
} from "../src/server/inbox/types";
import { api } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";

const bucketSchema = z.object({
	name: z.string().min(2).max(60),
	description: z.string().max(240).optional(),
});

const updateBucketSchema = bucketSchema.extend({
	id: z.string().min(1),
});

const deleteBucketSchema = z.object({
	id: z.string().min(1),
});

const checkNewSchema = z.object({
	knownIds: z.array(z.string()).max(200),
});

const chatSearchSchema = z.object({
	query: z.string().trim().min(2).max(500),
	limit: z.number().int().min(1).max(50).optional(),
});

const messageDetailSchema = z.object({
	id: z.string().trim().min(1),
});

const jsonHeaders = {
	"Content-Type": "application/json",
	"Access-Control-Allow-Origin": "*",
};

const redirect = (location: string) =>
	new Response(null, {
		status: 302,
		headers: {
			Location: location,
			"Access-Control-Allow-Origin": "*",
		},
	});

const getReturnOrigin = (value: string | null | undefined): string | null => {
	if (!value) {
		return null;
	}

	try {
		const parsed = new URL(value);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		return parsed.origin;
	} catch {
		return null;
	}
};

const buildAppRedirect = (
	request: Request,
	pathAndQuery = "/",
	state?: { returnOrigin?: string },
) => {
	const fromState = getReturnOrigin(state?.returnOrigin);
	if (fromState) {
		return `${fromState}${pathAndQuery}`;
	}

	const fromOrigin = getReturnOrigin(request.headers.get("origin"));
	if (fromOrigin) {
		return `${fromOrigin}${pathAndQuery}`;
	}

	return pathAndQuery;
};

const parseOAuthState = (
	state: string | null,
): { userId?: string; returnOrigin?: string } => {
	if (!state) {
		return {};
	}

	try {
		const parsed = JSON.parse(base64UrlDecode(state)) as {
			userId?: string;
			returnOrigin?: string;
		};
		return {
			...(parsed.userId ? { userId: parsed.userId } : {}),
			...(parsed.returnOrigin ? { returnOrigin: parsed.returnOrigin } : {}),
		};
	} catch {
		return {};
	}
};

const encodeOAuthState = (state: { userId: string; returnOrigin?: string }) =>
	base64UrlEncode(JSON.stringify(state));

const base64UrlEncode = (value: string) =>
	btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const base64UrlDecode = (value: string) => {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4;
	const padded =
		padding === 0
			? normalized
			: normalized.padEnd(normalized.length + (4 - padding), "=");
	return atob(padded);
};

const getUserFromRequest = async (request: Request) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return {
			userId: session?.user?.id ?? "local-user",
			session,
		};
	} catch {
		return {
			userId: "local-user",
			session: null,
		};
	}
};

const enforceRateLimit = async (
	ctx: ActionCtx,
	{
		route,
		userId,
		limit,
		windowMs,
	}: {
		route: string;
		userId: string;
		limit: number;
		windowMs: number;
	},
) =>
	ctx.runMutation(api.rateLimit.consume, {
		key: `${route}:${userId}`,
		limit,
		windowMs,
	});

const classifyUnseenThreads = async ({
	ctx,
	userId,
	threads,
	buckets,
}: {
	ctx: ActionCtx;
	userId: string;
	threads: ThreadSummary[];
	buckets: BucketDefinition[];
}): Promise<ThreadClassification[]> => {
	const uniqueEmailIds = [...new Set(threads.map((thread) => thread.id))];
	const cached = (await ctx.runQuery(api.inbox.getCachedClassifications, {
		userId,
		emailIds: uniqueEmailIds,
	})) as Array<{
		emailId: string;
		bucketId: string;
		confidence: number;
		reason?: string;
	}>;

	const validBucketIds = new Set(buckets.map((bucket) => bucket.id));
	const cacheByEmailId = new Map(
		cached
			.filter((entry) => validBucketIds.has(entry.bucketId))
			.map((entry) => [entry.emailId, entry] as const),
	);

	const seen: ThreadClassification[] = [];
	const unseen: ThreadSummary[] = [];

	for (const thread of threads) {
		const cachedEntry = cacheByEmailId.get(thread.id);
		if (!cachedEntry) {
			unseen.push(thread);
			continue;
		}

		seen.push({
			threadId: thread.id,
			bucketId: cachedEntry.bucketId,
			confidence: cachedEntry.confidence,
			reason: cachedEntry.reason,
		});
	}

	const newlyClassified = unseen.length
		? await classifyThreads(unseen, buckets)
		: [];

	if (newlyClassified.length > 0) {
		await ctx.runMutation(api.inbox.upsertCachedClassifications, {
			userId,
			entries: newlyClassified.map((classification) => ({
				emailId: classification.threadId,
				bucketId: classification.bucketId,
				confidence: classification.confidence,
				reason: classification.reason,
			})),
		});
	}

	const classificationByThreadId = new Map(
		[...seen, ...newlyClassified].map((classification) => [
			classification.threadId,
			classification,
		]),
	);

	return threads.map((thread) => {
		const classification = classificationByThreadId.get(thread.id);
		if (!classification) {
			const fallbackBucketId =
				buckets.find((bucket) => bucket.name === "Can Wait")?.id ??
				buckets[0]?.id;
			if (!fallbackBucketId) {
				throw new Error(`Missing classification for thread ${thread.id}`);
			}

			return {
				threadId: thread.id,
				bucketId: fallbackBucketId,
				confidence: 0.1,
				reason: "Fallback assignment due to missing classification.",
			};
		}
		return classification;
	});
};

const compareThreadRecency = (
	left: { id: string; receivedAt?: number },
	right: { id: string; receivedAt?: number },
) => {
	const leftTime = typeof left.receivedAt === "number" ? left.receivedAt : 0;
	const rightTime = typeof right.receivedAt === "number" ? right.receivedAt : 0;
	if (leftTime !== rightTime) {
		return rightTime - leftTime;
	}
	return left.id.localeCompare(right.id);
};

const getHandler = httpAction(async (ctx, request) => {
	const url = new URL(request.url);

	if (url.pathname === "/api/threads") {
		const limit = 200;
		try {
			console.log("[/api/threads] STEP 1: start request handling");
			const { userId } = await getUserFromRequest(request);
			console.log("[/api/threads] STEP 2: resolved user", { userId });
			const rateLimit = await enforceRateLimit(ctx, {
				route: "threads_get",
				userId,
				limit: 30,
				windowMs: 60_000,
			});
			console.log("[/api/threads] STEP 3: rate limit checked", {
				allowed: rateLimit.allowed,
			});
			if (!rateLimit.allowed) {
				return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
					status: 429,
					headers: jsonHeaders,
				});
			}

			const buckets = (await ctx.runMutation(api.inbox.ensureDefaultBuckets, {
				userId,
			})) as BucketDefinition[];
			console.log("[/api/threads] STEP 4: ensured buckets", {
				bucketCount: buckets.length,
			});
			const token = (await ctx.runQuery(api.inbox.getGoogleToken, {
				userId,
			})) as GoogleOAuthToken | null;
			console.log("[/api/threads] STEP 5: fetched Google token", {
				hasToken: Boolean(token),
			});

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

			let threads: ThreadSummary[];
			try {
				console.log("[/api/threads] STEP 6: fetching recent Gmail messages");
				threads = await listRecentMessages(token, limit);
				console.log("[/api/threads] STEP 7: fetched recent Gmail messages", {
					threadCount: threads.length,
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to fetch Gmail messages";
				console.error("[/api/threads] STEP 6 FAILED: listRecentMessages", {
					message,
					error,
				});
				if (
					message.includes("Failed to fetch Gmail messages: 401") ||
					message.includes("Failed to fetch Gmail messages: 403")
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
				throw error;
			}

			console.log("[/api/threads] STEP 8: classifying unseen threads");
			const classifications = await classifyUnseenThreads({
				ctx,
				userId,
				threads,
				buckets,
			});
			console.log("[/api/threads] STEP 9: computed classifications", {
				classificationCount: classifications.length,
			});
			console.log("[/api/threads] STEP 10: saving threads + classifications");
			await ctx.runMutation(api.inbox.saveThreadsAndClassifications, {
				userId,
				threads,
				classifications,
			});
			console.log("[/api/threads] STEP 11: querying inbox");
			const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });
			console.log("[/api/threads] STEP 12: responding success");

			return new Response(JSON.stringify({ limit, ...inbox }), {
				status: 200,
				headers: jsonHeaders,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load inbox";
			console.error("[/api/threads] STEP FAILED: unhandled error", {
				message,
				error,
			});
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: jsonHeaders,
			});
		}
	}

	if (url.pathname === "/api/auth/google/callback") {
		const code = url.searchParams.get("code");
		const state = parseOAuthState(url.searchParams.get("state"));

		if (!code) {
			return redirect(buildAppRedirect(request, "/?error=missing_code", state));
		}

		try {
			const { userId: sessionUserId } = await getUserFromRequest(request);
			const userId =
				sessionUserId === "local-user"
					? (state.userId ?? "local-user")
					: sessionUserId;
			const rateLimit = await enforceRateLimit(ctx, {
				route: "google_callback",
				userId,
				limit: 20,
				windowMs: 60_000,
			});
			if (!rateLimit.allowed) {
				return redirect(
					buildAppRedirect(request, "/?error=rate_limit_exceeded", state),
				);
			}

			const token = await exchangeCodeForGoogleToken(code);
			await ctx.runMutation(api.inbox.saveGoogleToken, {
				userId,
				token,
			});
			return redirect(buildAppRedirect(request, "/", state));
		} catch {
			return redirect(buildAppRedirect(request, "/?error=oauth_failed", state));
		}
	}

	return new Response(JSON.stringify({ error: "Not Found" }), {
		status: 404,
		headers: jsonHeaders,
	});
});

const postHandler = httpAction(async (ctx, request) => {
	const url = new URL(request.url);

	if (url.pathname === "/api/classify") {
		try {
			const { userId } = await getUserFromRequest(request);
			const rateLimit = await enforceRateLimit(ctx, {
				route: "classify_post",
				userId,
				limit: 20,
				windowMs: 60_000,
			});
			if (!rateLimit.allowed) {
				return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
					status: 429,
					headers: jsonHeaders,
				});
			}

			const payload = (await ctx.runQuery(api.inbox.getThreadsAndBuckets, {
				userId,
			})) as {
				buckets: BucketDefinition[];
				threads: ThreadSummary[];
			};
			const classifications = payload.threads.length
				? await classifyThreads(payload.threads, payload.buckets)
				: [];

			if (classifications.length > 0) {
				await ctx.runMutation(api.inbox.upsertCachedClassifications, {
					userId,
					entries: classifications.map((classification) => ({
						emailId: classification.threadId,
						bucketId: classification.bucketId,
						confidence: classification.confidence,
						reason: classification.reason,
					})),
				});
			}

			await ctx.runMutation(api.inbox.saveClassifications, {
				userId,
				classifications,
			});
			const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });
			return new Response(JSON.stringify(inbox), {
				status: 200,
				headers: jsonHeaders,
			});
		} catch {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: jsonHeaders,
			});
		}
	}

	if (url.pathname === "/api/chat/search") {
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

			const threads = [...stored.threads]
				.sort(compareThreadRecency)
				.slice(0, 200);
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
	}

	if (url.pathname === "/api/messages/detail") {
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
	}

	if (url.pathname === "/api/buckets") {
		try {
			const { userId } = await getUserFromRequest(request);
			const rateLimit = await enforceRateLimit(ctx, {
				route: "buckets_post",
				userId,
				limit: 15,
				windowMs: 60_000,
			});
			if (!rateLimit.allowed) {
				return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
					status: 429,
					headers: jsonHeaders,
				});
			}

			const body = (await request.json()) as unknown;
			const payload = bucketSchema.parse(body);
			await ctx.runMutation(api.inbox.addBucket, {
				userId,
				name: payload.name,
				description: payload.description,
			});
			const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });
			return new Response(JSON.stringify(inbox), {
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
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: jsonHeaders,
			});
		}
	}

	if (url.pathname === "/api/messages/check-new") {
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
	}

	if (url.pathname === "/api/logout") {
		try {
			const { userId } = await getUserFromRequest(request);
			await ctx.runMutation(api.inbox.deleteGoogleToken, { userId });
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: jsonHeaders,
			});
		} catch {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: jsonHeaders,
			});
		}
	}

	if (url.pathname === "/api/auth/google/start") {
		try {
			const { userId } = await getUserFromRequest(request);
			const rateLimit = await enforceRateLimit(ctx, {
				route: "google_start",
				userId,
				limit: 20,
				windowMs: 60_000,
			});
			if (!rateLimit.allowed) {
				return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
					status: 429,
					headers: jsonHeaders,
				});
			}

			const state = encodeOAuthState({
				userId,
				returnOrigin:
					getReturnOrigin(request.headers.get("origin")) ?? undefined,
			});
			const consentUrl = buildGoogleConsentUrl(state);
			return new Response(JSON.stringify({ url: consentUrl }), {
				status: 200,
				headers: jsonHeaders,
			});
		} catch {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: jsonHeaders,
			});
		}
	}

	return new Response(JSON.stringify({ error: "Not Found" }), {
		status: 404,
		headers: jsonHeaders,
	});
});

const putHandler = httpAction(async (ctx, request) => {
	const url = new URL(request.url);
	if (url.pathname !== "/api/buckets") {
		return new Response(JSON.stringify({ error: "Not Found" }), {
			status: 404,
			headers: jsonHeaders,
		});
	}

	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "buckets_post",
			userId,
			limit: 15,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const body = (await request.json()) as unknown;
		const payload = updateBucketSchema.parse(body);
		await ctx.runMutation(api.inbox.updateBucket, {
			userId,
			bucketId: payload.id,
			name: payload.name,
			description: payload.description,
		});
		const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });
		return new Response(JSON.stringify(inbox), {
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
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: jsonHeaders,
		});
	}
});

const deleteHandler = httpAction(async (ctx, request) => {
	const url = new URL(request.url);
	if (url.pathname !== "/api/buckets") {
		return new Response(JSON.stringify({ error: "Not Found" }), {
			status: 404,
			headers: jsonHeaders,
		});
	}

	try {
		const { userId } = await getUserFromRequest(request);
		const rateLimit = await enforceRateLimit(ctx, {
			route: "buckets_post",
			userId,
			limit: 15,
			windowMs: 60_000,
		});
		if (!rateLimit.allowed) {
			return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
				status: 429,
				headers: jsonHeaders,
			});
		}

		const body = (await request.json()) as unknown;
		const payload = deleteBucketSchema.parse(body);
		await ctx.runMutation(api.inbox.deleteBucket, {
			userId,
			bucketId: payload.id,
		});
		const inbox = await ctx.runQuery(api.inbox.getInbox, { userId });
		return new Response(JSON.stringify(inbox), {
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
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: jsonHeaders,
		});
	}
});

const optionsHandler = httpAction(async (_ctx, _request) => {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization",
		},
	});
});

const http = httpRouter();

http.route({ path: "/api/threads", method: "GET", handler: getHandler });
http.route({
	path: "/api/threads",
	method: "OPTIONS",
	handler: optionsHandler,
});
http.route({
	path: "/api/auth/google/callback",
	method: "GET",
	handler: getHandler,
});
http.route({
	path: "/api/auth/google/callback",
	method: "OPTIONS",
	handler: optionsHandler,
});

http.route({ path: "/api/classify", method: "POST", handler: postHandler });
http.route({
	path: "/api/classify",
	method: "OPTIONS",
	handler: optionsHandler,
});
http.route({ path: "/api/chat/search", method: "POST", handler: postHandler });
http.route({
	path: "/api/chat/search",
	method: "OPTIONS",
	handler: optionsHandler,
});
http.route({ path: "/api/buckets", method: "POST", handler: postHandler });
http.route({
	path: "/api/buckets",
	method: "OPTIONS",
	handler: optionsHandler,
});
http.route({
	path: "/api/messages/detail",
	method: "POST",
	handler: postHandler,
});
http.route({
	path: "/api/messages/detail",
	method: "OPTIONS",
	handler: optionsHandler,
});
http.route({
	path: "/api/messages/check-new",
	method: "POST",
	handler: postHandler,
});
http.route({
	path: "/api/messages/check-new",
	method: "OPTIONS",
	handler: optionsHandler,
});
http.route({ path: "/api/logout", method: "POST", handler: postHandler });
http.route({ path: "/api/logout", method: "OPTIONS", handler: optionsHandler });
http.route({
	path: "/api/auth/google/start",
	method: "POST",
	handler: postHandler,
});
http.route({
	path: "/api/auth/google/start",
	method: "OPTIONS",
	handler: optionsHandler,
});

http.route({ path: "/api/buckets", method: "PUT", handler: putHandler });
http.route({ path: "/api/buckets", method: "DELETE", handler: deleteHandler });

export default http;
