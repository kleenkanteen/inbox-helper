import { env } from "#/env";
import type { GoogleOAuthToken, ThreadSummary } from "#/server/inbox/types";

const GMAIL_LIST_MESSAGES_URL =
	"https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_GET_MESSAGE_URL =
	"https://gmail.googleapis.com/gmail/v1/users/me/messages";

const parseMessage = (item: unknown): ThreadSummary | null => {
	if (!item || typeof item !== "object") {
		return null;
	}
	const value = item as {
		id?: string;
		snippet?: string;
	};
	if (!value.id) {
		return null;
	}
	return {
		id: value.id,
		subject: "(No Subject)",
		snippet: value.snippet ?? "",
	};
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

const fetchMessageSubject = async (
	token: GoogleOAuthToken,
	messageId: string,
): Promise<string | undefined> => {
	const url = new URL(`${GMAIL_GET_MESSAGE_URL}/${messageId}`);
	url.searchParams.set("format", "metadata");
	url.searchParams.set("metadataHeaders", "Subject");
	url.searchParams.set("fields", "payload(headers(name,value))");

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token.accessToken}`,
		},
		cache: "no-store",
	});
	if (!response.ok) {
		return undefined;
	}
	return extractSubject(await response.json());
};

const hydrateSubjects = async (
	token: GoogleOAuthToken,
	messages: ThreadSummary[],
): Promise<ThreadSummary[]> => {
	const workers = Math.min(12, messages.length);
	const queue = [...messages];
	const subjectById = new Map<string, string>();

	await Promise.all(
		Array.from({ length: workers }, async () => {
			while (queue.length > 0) {
				const message = queue.shift();
				if (!message) {
					return;
				}
				const subject = await fetchMessageSubject(token, message.id);
				if (subject) {
					subjectById.set(message.id, subject);
				}
			}
		}),
	);

	return messages.map((message) => ({
		...message,
		subject: subjectById.get(message.id) ?? message.subject,
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
	url.searchParams.set("fields", "messages(id,snippet)");

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
		return hydrateSubjects(token, messages);
	}

	return Array.from({ length: limit }, (_, index) => ({
		id: `demo-${index + 1}`,
		subject: `Sample message ${index + 1}`,
		snippet: "This is a placeholder message snippet for development.",
	}));
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
