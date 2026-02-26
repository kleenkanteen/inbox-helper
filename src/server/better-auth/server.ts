import type { IncomingMessage } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from ".";

export const getSession = async (
	request: Pick<IncomingMessage, "headers">,
) => auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
