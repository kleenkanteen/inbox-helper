import type { IncomingMessage } from "node:http";
import { getSession } from "#/server/better-auth/server";

export const requireUser = async (
	request: Pick<IncomingMessage, "headers">,
) => {
	const session = await getSession(request);
	const userId = session?.user?.id ?? "local-user";
	return {
		userId,
		session,
	};
};
