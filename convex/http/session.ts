import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { getUserFromRequest, jsonHeaders } from "./shared";

export const postLogoutHandler = httpAction(async (_ctx, request) => {
	try {
		const { userId } = await getUserFromRequest(request);
		await _ctx.runMutation(api.inbox.deleteGoogleToken, { userId });
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
});
