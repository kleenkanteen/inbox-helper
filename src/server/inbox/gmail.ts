import type { GoogleOAuthToken, ThreadSummary } from "#/server/inbox/types";

const GMAIL_LIST_MESSAGES_URL =
	"https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_GET_MESSAGE_URL =
	"https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_GET_MESSAGE_ATTACHMENT_URL =
	"https://gmail.googleapis.com/gmail/v1/users/me/messages";
const BODY_PREVIEW_LIMIT = 200;

const getEnv = (key: string) => {
	const value = process.env[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
};

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
	const receivedAt = value.internalDate
		? Number(value.internalDate)
		: undefined;
	return {
		id: value.id,
		subject: "(No Subject)",
		snippet: value.snippet
			? normalizeWhitespace(decodeHtmlEntities(value.snippet))
			: "",
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

const extractHeaderValue = (
	payload: unknown,
	headerName: string,
): string | undefined => {
	if (!payload || typeof payload !== "object") {
		return undefined;
	}
	const value = payload as {
		payload?: {
			headers?: Array<{ name?: string; value?: string }>;
		};
	};
	const headers = value.payload?.headers ?? [];
	const header = headers.find(
		(entry) => entry.name?.toLowerCase() === headerName.toLowerCase(),
	);
	return header?.value?.trim() || undefined;
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

const extractSnippet = (payload: unknown): string | undefined => {
	if (!payload || typeof payload !== "object") {
		return undefined;
	}
	const value = payload as { snippet?: string };
	const snippet = value.snippet
		? normalizeWhitespace(decodeHtmlEntities(value.snippet))
		: undefined;
	return snippet && snippet.length > 0 ? snippet : undefined;
};

const extractSender = (payload: unknown): string | undefined => {
	return extractHeaderValue(payload, "from");
};

const decodeBase64Url = (value: string): string => {
	try {
		const normalized = value
			.replace(/\s+/g, "")
			.replace(/-/g, "+")
			.replace(/_/g, "/");
		const padding = normalized.length % 4;
		const padded =
			padding === 0
				? normalized
				: normalized.padEnd(normalized.length + (4 - padding), "=");
		const binary = atob(padded);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		const utf8 = new TextDecoder().decode(bytes);
		if (utf8.trim().length > 0) {
			return utf8;
		}
		return binary;
	} catch {
		return "";
	}
};

const decodeHtmlEntities = (value: string): string => {
	const namedEntities: Record<string, string> = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: '"',
		apos: "'",
		nbsp: " ",
	};

	return value.replace(
		/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,
		(match, entity: string) => {
			if (entity.startsWith("#x") || entity.startsWith("#X")) {
				const codePoint = Number.parseInt(entity.slice(2), 16);
				return Number.isFinite(codePoint)
					? String.fromCodePoint(codePoint)
					: match;
			}
			if (entity.startsWith("#")) {
				const codePoint = Number.parseInt(entity.slice(1), 10);
				return Number.isFinite(codePoint)
					? String.fromCodePoint(codePoint)
					: match;
			}
			return namedEntities[entity] ?? match;
		},
	);
};

const normalizeWhitespace = (value: string) =>
	value.replace(/\s+/g, " ").trim();

const stripHtml = (value: string): string => {
	const noScripts = value
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ");
	return noScripts.replace(/<[^>]+>/g, " ");
};

type GmailBodyPart = {
	mimeType?: string;
	body?: { data?: string; attachmentId?: string };
	parts?: GmailBodyPart[];
};

type MessageDetailPayload = {
	id: string;
	subject?: string;
	from?: string;
	to?: string;
	date?: string;
	html: string;
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
		? normalizeWhitespace(decodeHtmlEntities(decodeBase64Url(part.body.data)))
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

const fetchAttachmentData = async ({
	token,
	messageId,
	attachmentId,
}: {
	token: GoogleOAuthToken;
	messageId: string;
	attachmentId: string;
}) => {
	const url = `${GMAIL_GET_MESSAGE_ATTACHMENT_URL}/${messageId}/attachments/${attachmentId}`;
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token.accessToken}`,
		},
		cache: "no-store",
	});
	if (!response.ok) {
		return "";
	}
	const payload = (await response.json()) as { data?: string };
	return payload.data ? decodeBase64Url(payload.data) : "";
};

const collectBodyContent = async (
	part: GmailBodyPart | undefined,
	plainText: string[],
	htmlText: string[],
	options: { token: GoogleOAuthToken; messageId: string },
) => {
	if (!part) {
		return;
	}

	let decoded = part.body?.data ? decodeBase64Url(part.body.data) : "";
	if (!decoded && part.body?.attachmentId) {
		decoded = await fetchAttachmentData({
			token: options.token,
			messageId: options.messageId,
			attachmentId: part.body.attachmentId,
		});
	}
	if (decoded) {
		if (part.mimeType?.startsWith("text/html")) {
			htmlText.push(decoded);
		} else if (part.mimeType?.startsWith("text/plain")) {
			plainText.push(decoded);
		} else if (!part.parts || part.parts.length === 0) {
			plainText.push(decoded);
		}
	}

	for (const child of part.parts ?? []) {
		await collectBodyContent(child, plainText, htmlText, options);
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
): Promise<{
	subject?: string;
	bodyPreview?: string;
	receivedAt?: number;
	snippet?: string;
	sender?: string;
}> => {
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
		snippet: extractSnippet(payload),
		sender: extractSender(payload),
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
	const snippetById = new Map<string, string>();
	const receivedAtById = new Map<string, number>();
	const senderById = new Map<string, string>();

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
				if (details.snippet) {
					snippetById.set(message.id, details.snippet);
				}
				if (typeof details.receivedAt === "number") {
					receivedAtById.set(message.id, details.receivedAt);
				}
				if (details.sender) {
					senderById.set(message.id, details.sender);
				}
			}
		}),
	);

	return messages
		.map((message) => ({
			...message,
			subject: subjectById.get(message.id) ?? message.subject,
			snippet:
				bodyPreviewById.get(message.id) ??
				snippetById.get(message.id) ??
				message.snippet?.trim() ??
				"",
			receivedAt: receivedAtById.get(message.id) ?? message.receivedAt,
			sender: senderById.get(message.id) ?? message.sender,
		}))
		.map((message) => ({
			...message,
			snippet:
				message.snippet.trim().length > 0
					? decodeHtmlEntities(message.snippet)
					: message.subject.trim().length > 0
						? `Subject: ${message.subject}`
						: "(No preview available)",
		}));
};

const sanitizeMessageHtml = (value: string) => {
	const withoutDangerousTags = value
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
		.replace(/<object[\s\S]*?<\/object>/gi, "")
		.replace(/<embed[\s\S]*?>/gi, "");
	const withoutInlineHandlers = withoutDangerousTags.replace(
		/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi,
		"",
	);
	const withoutJsProtocols = withoutInlineHandlers
		.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"')
		.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'");
	return withoutJsProtocols.trim();
};

const escapeHtml = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const decodeQuotedPrintable = (value: string) =>
	value
		.replace(/=\r?\n/g, "")
		.replace(/=([A-Fa-f0-9]{2})/g, (_match, hex: string) =>
			String.fromCharCode(Number.parseInt(hex, 16)),
		);

const decodeTransferEncoded = (value: string, encoding?: string) => {
	const normalizedEncoding = encoding?.toLowerCase().trim();
	if (normalizedEncoding === "quoted-printable") {
		return decodeQuotedPrintable(value);
	}
	if (normalizedEncoding === "base64") {
		try {
			const compact = value.replace(/\s+/g, "");
			const binary = atob(compact);
			const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		} catch {
			return value;
		}
	}
	return value;
};

const extractMimeSection = (
	rawMessage: string,
	contentTypePattern: RegExp,
): { body?: string; transferEncoding?: string } => {
	const headerAndBodyRegex = new RegExp(
		`Content-Type:\\s*${contentTypePattern.source}[\\s\\S]*?(?:\\r?\\n\\r?\\n)([\\s\\S]*?)(?=\\r?\\n--[\\w'()+_,\\-.\\/:=? ]+|$)`,
		"i",
	);
	const bodyMatch = rawMessage.match(headerAndBodyRegex);
	if (!bodyMatch) {
		return {};
	}

	const blockStart = bodyMatch.index ?? 0;
	const headerBlock = rawMessage.slice(
		Math.max(0, blockStart - 600),
		blockStart + 400,
	);
	const encodingMatch = headerBlock.match(
		/Content-Transfer-Encoding:\s*([^\r\n]+)/i,
	);

	return {
		body: bodyMatch[1]?.trim(),
		transferEncoding: encodingMatch?.[1]?.trim(),
	};
};

const fetchRawMessageBody = async ({
	token,
	messageId,
}: {
	token: GoogleOAuthToken;
	messageId: string;
}) => {
	const url = new URL(`${GMAIL_GET_MESSAGE_URL}/${messageId}`);
	url.searchParams.set("format", "raw");

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token.accessToken}`,
		},
		cache: "no-store",
	});
	if (!response.ok) {
		return {};
	}

	const payload = (await response.json()) as { raw?: string };
	if (!payload.raw) {
		return {};
	}

	const rawMessage = decodeBase64Url(payload.raw);
	if (!rawMessage) {
		return {};
	}

	const htmlSection = extractMimeSection(rawMessage, /text\/html[^;\r\n]*/);
	const textSection = extractMimeSection(rawMessage, /text\/plain[^;\r\n]*/);
	const decodedHtml = htmlSection.body
		? decodeTransferEncoded(htmlSection.body, htmlSection.transferEncoding)
		: "";
	const decodedText = textSection.body
		? decodeTransferEncoded(textSection.body, textSection.transferEncoding)
		: "";

	return {
		html: decodedHtml.trim() || undefined,
		text: decodedText.trim() || undefined,
		raw: rawMessage.trim() || undefined,
	};
};

export const fetchMessageDetail = async ({
	token,
	messageId,
}: {
	token: GoogleOAuthToken;
	messageId: string;
}): Promise<MessageDetailPayload> => {
	const url = new URL(`${GMAIL_GET_MESSAGE_URL}/${messageId}`);
	url.searchParams.set("format", "full");

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token.accessToken}`,
		},
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch Gmail message detail: ${response.status}`);
	}

	const payload = await response.json();
	const root = (payload as { payload?: GmailBodyPart }).payload;
	const htmlParts: string[] = [];
	const plainParts: string[] = [];
	await collectBodyContent(root, plainParts, htmlParts, {
		token,
		messageId,
	});
	const snippetFallback = extractSnippet(payload) ?? "(No content available)";
	let fullHtml = htmlParts.join("\n").trim();
	let fullText = normalizeWhitespace(plainParts.join("\n"));

	if (!fullHtml && !fullText) {
		const raw = await fetchRawMessageBody({ token, messageId });
		if (raw.html) {
			fullHtml = raw.html;
		}
		if (raw.text) {
			fullText = normalizeWhitespace(raw.text);
		}
		// Last-resort fallback: always show full Gmail payload text rather than snippet.
		if (!fullHtml && !fullText && raw.raw) {
			fullText = raw.raw;
		}
	}

	const html =
		fullHtml.length > 0
			? sanitizeMessageHtml(fullHtml)
			: `<pre>${escapeHtml(fullText || snippetFallback)}</pre>`;

	return {
		id: messageId,
		subject: extractSubject(payload),
		from: extractHeaderValue(payload, "from"),
		to: extractHeaderValue(payload, "to"),
		date: extractHeaderValue(payload, "date"),
		html: html || "<pre>(No content available)</pre>",
	};
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
	const clientId = requiredEnv(getEnv("GOOGLE_CLIENT_ID"), "GOOGLE_CLIENT_ID");
	const clientSecret = requiredEnv(
		getEnv("GOOGLE_CLIENT_SECRET"),
		"GOOGLE_CLIENT_SECRET",
	);
	const redirectUri = requiredEnv(
		getEnv("GOOGLE_REDIRECT_URI"),
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
	const clientId = requiredEnv(getEnv("GOOGLE_CLIENT_ID"), "GOOGLE_CLIENT_ID");
	const redirectUri = requiredEnv(
		getEnv("GOOGLE_REDIRECT_URI"),
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
