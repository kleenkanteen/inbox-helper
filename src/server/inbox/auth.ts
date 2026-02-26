import type { IncomingMessage } from "node:http";
import { getSession } from "#/server/better-auth/server";

export const requireUser = async (
	request: Pick<IncomingMessage, "headers">,
) => {
	let session: Awaited<ReturnType<typeof getSession>> | null = null;
	try {
		session = await getSession(request);
	} catch {
		session = null;
	}
	const userId = session?.user?.id ?? "local-user";
	return {
		userId,
		session,
	};
};
