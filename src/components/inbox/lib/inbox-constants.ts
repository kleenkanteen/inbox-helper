import { env } from "#/env";

export const defaultBucketOrder = [
	"Important",
	"Can Wait",
	"Auto-Archive",
	"Newsletter",
];

const convexSiteUrl =
	env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/+$/, "") ?? "";

export const convexApiUrl = (path: string) =>
	convexSiteUrl ? `${convexSiteUrl}${path}` : path;

export const inboxCacheKey = "inbox-helper:inbox-response:v1";

export const buttonClass =
	"cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60";
