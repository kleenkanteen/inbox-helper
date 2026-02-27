import {
	buildGoogleConsentUrl,
	exchangeCodeForGoogleToken,
} from "../../src/server/inbox/gmail";
import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";
import {
	buildAppRedirect,
	encodeOAuthState,
	enforceRateLimit,
	getReturnOrigin,
	getUserFromRequest,
	jsonHeaders,
	parseOAuthState,
	redirect,
} from "./shared";

export const getGoogleCallbackHandler = httpAction(async (ctx, request) => {
	const url = new URL(request.url);
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
});

export const postGoogleStartHandler = httpAction(async (ctx, request) => {
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
			returnOrigin: getReturnOrigin(request.headers.get("origin")) ?? undefined,
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
});
