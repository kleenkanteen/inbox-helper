import { toNodeHandler } from "better-auth/node";
import type { NextApiHandler } from "next";

import { auth } from "#/server/better-auth";

const authHandler = toNodeHandler(auth);

const handler: NextApiHandler = async (req, res) => {
	await authHandler(req, res);
};

export default handler;
