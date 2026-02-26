import { env } from "#/env";
import type { GoogleOAuthToken, ThreadSummary } from "#/server/inbox/types";

const GMAIL_LIST_MESSAGES_URL =
	"https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_GET_MESSAGE_URL =
	"https://gmail.googleapis.com/gmail/v1/users/me/messages";
const BODY_PREVIEW_LIMIT = 200;

const parseMessage = (item: unknown): ThreadSummary | null => {
	if (!item || typeof item !== "object") {
		return null;
	}
	const value = item as {
		id?: string;
		snippet?: string;
		internalDate?: string;
	};
	if (!value.id) {
		return null;
	}
	const receivedAt = value.internalDate ? Number(value.internalDate) : undefined;
	return {
		id: value.id,
		subject: "(No Subject)",
		snippet: value.snippet ?? "",
		...(Number.isFinite(receivedAt) ? { receivedAt } : {}),
	};
};

const parseMessageId = (item: unknown): string | null => {
	if (!item || typeof item !== "object") {
		return null;
	}
	const value = item as { id?: string };
	return value.id ?? null;
};

const extractSubject = (payload: unknown): string | undefined => {
	if (!payload || typeof payload !== "object") {
		return undefined;
	}
	const value = payload as {
		payload?: {
			headers?: Array<{ name?: string; value?: string }>;
		};
	};
	const headers = value.payload?.headers ?? [];
	const subjectHeader = headers.find(
		(header) => header.name?.toLowerCase() === "subject",
	);
	return subjectHeader?.value?.trim() || undefined;
};

const extractInternalDate = (payload: unknown): number | undefined => {
	if (!payload || typeof payload !== "object") {
		return undefined;
	}
	const value = payload as { internalDate?: string };
	if (!value.internalDate) {
		return undefined;
	}
	const timestamp = Number(value.internalDate);
	return Number.isFinite(timestamp) ? timestamp : undefined;
};

const decodeBase64Url = (value: string): string => {
	try {
		const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
		const padding = normalized.length % 4;
		const padded =
			padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), "=");
		return Buffer.from(padded, "base64").toString("utf8");
	} catch {
		return "";
	}
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const stripHtml = (value: string): string => {
	const noScripts = value
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ");
	return noScripts.replace(/<[^>]+>/g, " ");
};

type GmailBodyPart = {
	mimeType?: string;
	body?: { data?: string };
	parts?: GmailBodyPart[];
};

const collectBodyText = (
	part: GmailBodyPart | undefined,
	plainText: string[],
	htmlText: string[],
) => {
	if (!part) {
		return;
	}

	const decoded = part.body?.data
		? normalizeWhitespace(decodeBase64Url(part.body.data))
		: "";
	if (decoded) {
		if (part.mimeType?.startsWith("text/plain")) {
			plainText.push(decoded);
		} else if (part.mimeType?.startsWith("text/html")) {
			htmlText.push(normalizeWhitespace(stripHtml(decoded)));
		} else if (!part.parts || part.parts.length === 0) {
			plainText.push(decoded);
		}
	}

	for (const child of part.parts ?? []) {
		collectBodyText(child, plainText, htmlText);
	}
};

const extractBodyPreview = (payload: unknown): string | undefined => {
	if (!payload || typeof payload !== "object") {
		return undefined;
	}
	const value = payload as { payload?: GmailBodyPart };
	const root = value.payload;
	if (!root) {
		return undefined;
	}

	const plainText: string[] = [];
	const htmlText: string[] = [];
	collectBodyText(root, plainText, htmlText);

	const combinedPlain = normalizeWhitespace(plainText.join(" "));
	if (combinedPlain) {
		return combinedPlain.slice(0, BODY_PREVIEW_LIMIT);
	}

	const combinedHtml = normalizeWhitespace(htmlText.join(" "));
	if (combinedHtml) {
		return combinedHtml.slice(0, BODY_PREVIEW_LIMIT);
	}

	return undefined;
};

const fetchMessageDetails = async (
	token: GoogleOAuthToken,
	messageId: string,
): Promise<{ subject?: string; bodyPreview?: string; receivedAt?: number }> => {
	const url = new URL(`${GMAIL_GET_MESSAGE_URL}/${messageId}`);
	url.searchParams.set("format", "full");

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token.accessToken}`,
		},
		cache: "no-store",
	});
	if (!response.ok) {
		return {};
	}
	const payload = await response.json();
	return {
		subject: extractSubject(payload),
		bodyPreview: extractBodyPreview(payload),
		receivedAt: extractInternalDate(payload),
	};
};

const hydrateMessageDetails = async (
	token: GoogleOAuthToken,
	messages: ThreadSummary[],
): Promise<ThreadSummary[]> => {
	const workers = Math.min(12, messages.length);
	const queue = [...messages];
	const subjectById = new Map<string, string>();
	const bodyPreviewById = new Map<string, string>();
	const receivedAtById = new Map<string, number>();

	await Promise.all(
		Array.from({ length: workers }, async () => {
			while (queue.length > 0) {
				const message = queue.shift();
				if (!message) {
					return;
				}
				const details = await fetchMessageDetails(token, message.id);
				if (details.subject) {
					subjectById.set(message.id, details.subject);
				}
				if (details.bodyPreview) {
					bodyPreviewById.set(message.id, details.bodyPreview);
				}
				if (typeof details.receivedAt === "number") {
					receivedAtById.set(message.id, details.receivedAt);
				}
			}
		}),
	);

	return messages.map((message) => ({
		...message,
		subject: subjectById.get(message.id) ?? message.subject,
		snippet: bodyPreviewById.get(message.id) ?? message.snippet,
		receivedAt: receivedAtById.get(message.id) ?? message.receivedAt,
	}));
};

const requiredEnv = (value: string | undefined, key: string): string => {
	if (!value) {
		throw new Error(`Missing required env var: ${key}`);
	}
	return value;
};

export const listRecentMessages = async (
	token: GoogleOAuthToken,
	limit = 200,
): Promise<ThreadSummary[]> => {
	const url = new URL(GMAIL_LIST_MESSAGES_URL);
	url.searchParams.set("maxResults", String(Math.min(500, Math.max(1, limit))));
	url.searchParams.set("fields", "messages(id,snippet,internalDate)");

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token.accessToken}`,
		},
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch Gmail messages: ${response.status}`);
	}

	const payload = (await response.json()) as { messages?: unknown[] };
	const messages = (payload.messages ?? [])
		.map(parseMessage)
		.filter((thread): thread is ThreadSummary => Boolean(thread));

	if (messages.length > 0) {
		return hydrateMessageDetails(token, messages);
	}

	return Array.from({ length: limit }, (_, index) => ({
		id: `demo-${index + 1}`,
		subject: `Sample message ${index + 1}`,
		snippet: "This is a placeholder message snippet for development.",
	}));
};

export const listRecentMessageIds = async (
	token: GoogleOAuthToken,
	limit = 200,
): Promise<string[]> => {
	const url = new URL(GMAIL_LIST_MESSAGES_URL);
	url.searchParams.set("maxResults", String(Math.min(500, Math.max(1, limit))));
	url.searchParams.set("fields", "messages(id)");

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token.accessToken}`,
		},
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch Gmail message ids: ${response.status}`);
	}

	const payload = (await response.json()) as { messages?: unknown[] };
	return (payload.messages ?? [])
		.map(parseMessageId)
		.filter((id): id is string => Boolean(id));
};

export const exchangeCodeForGoogleToken = async (code: string) => {
	const clientId = requiredEnv(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID");
	const clientSecret = requiredEnv(
		env.GOOGLE_CLIENT_SECRET,
		"GOOGLE_CLIENT_SECRET",
	);
	const redirectUri = requiredEnv(
		env.GOOGLE_REDIRECT_URI,
		"GOOGLE_REDIRECT_URI",
	);

	const body = new URLSearchParams({
		code,
		client_id: clientId,
		client_secret: clientSecret,
		redirect_uri: redirectUri,
		grant_type: "authorization_code",
	});

	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});

	if (!response.ok) {
		throw new Error(`Token exchange failed: ${response.status}`);
	}

	const token = (await response.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in?: number;
		scope?: string;
		token_type?: string;
	};

	return {
		accessToken: token.access_token,
		refreshToken: token.refresh_token,
		expiresAt: token.expires_in
			? Date.now() + token.expires_in * 1000
			: undefined,
		scope: token.scope,
		tokenType: token.token_type,
	};
};

export const buildGoogleConsentUrl = (state: string) => {
	const clientId = requiredEnv(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID");
	const redirectUri = requiredEnv(
		env.GOOGLE_REDIRECT_URI,
		"GOOGLE_REDIRECT_URI",
	);
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set(
		"scope",
		"openid email profile https://www.googleapis.com/auth/gmail.readonly",
	);
	url.searchParams.set("access_type", "offline");
	url.searchParams.set("prompt", "consent");
	url.searchParams.set("state", state);
	return url.toString();
};
