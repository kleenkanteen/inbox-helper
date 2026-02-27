import { convexApiUrl } from "#/components/inbox/lib/inbox-constants";
import type {
	ChatSearchResponse,
	CheckNewResponse,
	InboxResponse,
	MessageDetailResponse,
} from "#/components/inbox/types/inbox-types";

type ApiResult<T> = {
	ok: boolean;
	payload: T;
};

const requestJson = async <T>(
	path: string,
	init: RequestInit,
): Promise<ApiResult<T>> => {
	const response = await fetch(convexApiUrl(path), init);
	const payload = (await response.json()) as T;
	return {
		ok: response.ok,
		payload,
	};
};

export const getThreads = (limit = 200) =>
	requestJson<InboxResponse>(`/api/threads?limit=${limit}`, {
		method: "GET",
		cache: "no-store",
	});

export const checkNewMessages = (knownIds: string[]) =>
	requestJson<CheckNewResponse>("/api/messages/check-new", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ knownIds }),
	});

export const startGoogleAuth = () =>
	requestJson<{ url?: string; error?: string }>("/api/auth/google/start", {
		method: "POST",
	});

export const logoutRequest = () =>
	requestJson<{ error?: string }>("/api/logout", {
		method: "POST",
	});

export const classifyInbox = () =>
	requestJson<InboxResponse>("/api/classify", {
		method: "POST",
	});

export const createBucket = (input: { name: string; description?: string }) =>
	requestJson<InboxResponse>("/api/buckets", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});

export const updateBucket = (input: {
	id: string;
	name: string;
	description?: string;
}) =>
	requestJson<InboxResponse>("/api/buckets", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});

export const deleteBucket = (id: string) =>
	requestJson<InboxResponse>("/api/buckets", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id }),
	});

export const searchEmails = (query: string) =>
	requestJson<ChatSearchResponse>("/api/chat/search", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query }),
	});

export const getMessageDetail = (id: string) =>
	requestJson<MessageDetailResponse>("/api/messages/detail", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id }),
	});
