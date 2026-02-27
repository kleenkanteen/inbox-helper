import {
	AlertCircle,
	Archive,
	ArrowLeft,
	Clock3,
	LogOut,
	MessageCircle,
	Newspaper,
	RefreshCw,
	Settings2,
	Sparkles,
	Tag,
	X,
} from "lucide-react";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpinnerBadge } from "#/components/spinner-badge";
import { env } from "#/env";
import { authClient } from "#/server/better-auth/client";

type BucketDefinition = {
	id: string;
	name: string;
	type: "default" | "custom";
	description?: string;
};

type BucketedThread = {
	id: string;
	subject: string;
	snippet: string;
	receivedAt?: number;
	confidence: number;
};

type GroupedBucket = {
	bucket: BucketDefinition;
	threads: BucketedThread[];
};

type InboxResponse = {
	buckets: BucketDefinition[];
	grouped: GroupedBucket[];
	needsGoogleAuth?: boolean;
	error?: string;
};

type CheckNewResponse = {
	hasNew: boolean;
	latestIds: string[];
	needsGoogleAuth?: boolean;
	error?: string;
};

type ChatResultItem = {
	id: string;
	subject: string;
	snippet: string;
	sender?: string;
	receivedAt?: number;
};

type ChatSearchResponse = {
	query: string;
	totalCandidates: number;
	results: ChatResultItem[];
	error?: string;
	needsGoogleAuth?: boolean;
};

type MessageDetailResponse = {
	id: string;
	subject?: string;
	from?: string;
	to?: string;
	date?: string;
	html: string;
	error?: string;
	needsGoogleAuth?: boolean;
};

const defaultBucketOrder = [
	"Important",
	"Can Wait",
	"Auto-Archive",
	"Newsletter",
];

const convexSiteUrl =
	env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/+$/, "") ?? "";
const convexApiUrl = (path: string) =>
	convexSiteUrl ? `${convexSiteUrl}${path}` : path;
const inboxCacheKey = "inbox-helper:inbox-response:v1";

const buttonClass =
	"cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60";

const getImportantBucketId = (payload: InboxResponse | null): string | null => {
	if (!payload || !Array.isArray(payload.buckets)) {
		return null;
	}
	const important = payload.buckets.find(
		(bucket) => bucket.name === "Important",
	);
	return important?.id ?? payload.buckets[0]?.id ?? null;
};

const bucketIcon = (bucket: BucketDefinition) => {
	if (bucket.name === "Important") {
		return AlertCircle;
	}
	if (bucket.name === "Can Wait") {
		return Clock3;
	}
	if (bucket.name === "Auto-Archive") {
		return Archive;
	}
	if (bucket.name === "Newsletter") {
		return Newspaper;
	}
	return Tag;
};

const formatThreadDate = (receivedAt?: number) => {
	if (!receivedAt || !Number.isFinite(receivedAt)) {
		return "";
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	}).format(new Date(receivedAt));
};

const buildMessageSrcDoc = (rawHtml: string) => `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<style>
		html, body { margin: 0; padding: 0; }
		body {
			padding: 12px;
			font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
			font-size: 14px;
			line-height: 1.45;
			color: #0f172a;
			white-space: normal;
			word-break: break-word;
			overflow-wrap: anywhere;
		}
		* {
			max-width: 100%;
			box-sizing: border-box;
			word-break: break-word;
			overflow-wrap: anywhere;
		}
		pre {
			white-space: pre-wrap;
			word-break: break-word;
			overflow-wrap: anywhere;
		}
	</style>
</head>
<body>${rawHtml}</body>
</html>`;

const sortThreadsByRecency = (left: BucketedThread, right: BucketedThread) => {
	const leftTime = typeof left.receivedAt === "number" ? left.receivedAt : 0;
	const rightTime = typeof right.receivedAt === "number" ? right.receivedAt : 0;
	if (leftTime !== rightTime) {
		return rightTime - leftTime;
	}
	return left.id.localeCompare(right.id);
};

const normalizeInboxResponse = (
	payload: InboxResponse,
	maxThreads = 200,
): InboxResponse => {
	const grouped = Array.isArray(payload.grouped) ? payload.grouped : [];
	const flattened = grouped.flatMap((group) =>
		group.threads.map((thread) => ({
			bucketId: group.bucket.id,
			thread,
		})),
	);
	const keptThreadIds = new Set(
		flattened
			.sort((left, right) => sortThreadsByRecency(left.thread, right.thread))
			.slice(0, maxThreads)
			.map((entry) => entry.thread.id),
	);

	return {
		...payload,
		grouped: grouped.map((group) => ({
			...group,
			threads: [...group.threads]
				.filter((thread) => keptThreadIds.has(thread.id))
				.sort(sortThreadsByRecency),
		})),
	};
};

export default function Home() {
	const [data, setData] = useState<InboxResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [updatingBadgeCount, setUpdatingBadgeCount] = useState(0);
	const [isResolvingGoogleConnection, setIsResolvingGoogleConnection] =
		useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
	const [showConfigure, setShowConfigure] = useState(false);
	const [newBucketName, setNewBucketName] = useState("");
	const [newBucketDescription, setNewBucketDescription] = useState("");
	const [categoryDrafts, setCategoryDrafts] = useState<
		Record<string, { name: string; description: string }>
	>({});
	const [categoryActionKey, setCategoryActionKey] = useState<string | null>(
		null,
	);
	const [isChatOpen, setIsChatOpen] = useState(false);
	const [chatQuery, setChatQuery] = useState("");
	const [chatLoading, setChatLoading] = useState(false);
	const [chatError, setChatError] = useState<string | null>(null);
	const [chatResults, setChatResults] = useState<ChatResultItem[]>([]);
	const [selectedChatEmail, setSelectedChatEmail] =
		useState<ChatResultItem | null>(null);
	const [messageDetail, setMessageDetail] =
		useState<MessageDetailResponse | null>(null);
	const [messageLoading, setMessageLoading] = useState(false);
	const [messageError, setMessageError] = useState<string | null>(null);
	const [isCategoryMessageOpen, setIsCategoryMessageOpen] = useState(false);
	const [selectedCategoryEmail, setSelectedCategoryEmail] =
		useState<ChatResultItem | null>(null);
	const [categoryMessageDetail, setCategoryMessageDetail] =
		useState<MessageDetailResponse | null>(null);
	const [categoryMessageLoading, setCategoryMessageLoading] = useState(false);
	const [categoryMessageError, setCategoryMessageError] = useState<
		string | null
	>(null);
	const isUpdatingBadgeVisible = updatingBadgeCount > 0;
	const hasHydratedFromCache = useRef(false);

	const knownThreadIds = useMemo(
		() =>
			data?.grouped?.flatMap((group) =>
				group.threads.map((thread) => thread.id),
			) ?? [],
		[data],
	);

	const groupedByBucketId = useMemo(() => {
		return new Map(
			(data?.grouped ?? []).map((group) => [group.bucket.id, group]),
		);
	}, [data]);

	const orderedBuckets = useMemo(() => {
		if (!data || !Array.isArray(data.buckets)) {
			return [] as BucketDefinition[];
		}

		const orderIndex = new Map(
			defaultBucketOrder.map((name, index) => [name, index]),
		);
		return [...data.buckets].sort((left, right) => {
			const leftIndex = orderIndex.get(left.name);
			const rightIndex = orderIndex.get(right.name);

			if (leftIndex !== undefined && rightIndex !== undefined) {
				return leftIndex - rightIndex;
			}
			if (leftIndex !== undefined) {
				return -1;
			}
			if (rightIndex !== undefined) {
				return 1;
			}
			return left.name.localeCompare(right.name);
		});
	}, [data]);

	const selectedGroup = useMemo(() => {
		if (!selectedBucketId) {
			return null;
		}
		return groupedByBucketId.get(selectedBucketId) ?? null;
	}, [groupedByBucketId, selectedBucketId]);

	const loadThreads = useCallback(
		async (options?: {
			background?: boolean;
			showUpdatingBadge?: boolean;
			resolveGoogleConnection?: boolean;
		}) => {
			const isBackground = options?.background ?? false;
			if (!isBackground) {
				setLoading(true);
			}
			if (options?.showUpdatingBadge) {
				setUpdatingBadgeCount((count) => count + 1);
			}
			if (options?.resolveGoogleConnection) {
				setIsResolvingGoogleConnection(true);
			}
			setError(null);
			try {
				const response = await fetch(convexApiUrl("/api/threads?limit=200"), {
					method: "GET",
					cache: "no-store",
				});
				const payload = (await response.json()) as InboxResponse;
				const normalizedPayload = normalizeInboxResponse(payload);
				if (!response.ok) {
					setData(normalizedPayload);
					setError(payload.error ?? "Failed to load inbox");
					return;
				}

				setData(normalizedPayload);
				setSelectedBucketId((current) => {
					if (
						current &&
						Array.isArray(normalizedPayload.buckets) &&
						normalizedPayload.buckets.some((bucket) => bucket.id === current)
					) {
						return current;
					}
					return getImportantBucketId(normalizedPayload);
				});
			} finally {
				if (!isBackground) {
					setLoading(false);
				}
				if (options?.showUpdatingBadge) {
					setUpdatingBadgeCount((count) => Math.max(0, count - 1));
				}
				if (options?.resolveGoogleConnection) {
					setIsResolvingGoogleConnection(false);
				}
			}
		},
		[],
	);

	const checkForNewMessages = useCallback(
		async (ids?: string[], options?: { needsGoogleAuth?: boolean }) => {
			if (options?.needsGoogleAuth ?? data?.needsGoogleAuth) {
				return;
			}

			const response = await fetch(convexApiUrl("/api/messages/check-new"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ knownIds: ids ?? knownThreadIds }),
			});

			if (!response.ok) {
				return;
			}

			const payload = (await response.json()) as CheckNewResponse;
			if (payload.needsGoogleAuth) {
				return;
			}

			if (payload.hasNew) {
				await loadThreads({ background: true });
			}
		},
		[data?.needsGoogleAuth, knownThreadIds, loadThreads],
	);

	useEffect(() => {
		if (hasHydratedFromCache.current) {
			return;
		}
		hasHydratedFromCache.current = true;

		if (typeof window === "undefined") {
			return;
		}

		const cached = window.localStorage.getItem(inboxCacheKey);
		if (!cached) {
			void loadThreads();
			return;
		}

		try {
			const payload = normalizeInboxResponse(
				JSON.parse(cached) as InboxResponse,
			);
			setData(payload);
			setSelectedBucketId((current) => {
				if (
					current &&
					Array.isArray(payload.buckets) &&
					payload.buckets.some((bucket) => bucket.id === current)
				) {
					return current;
				}
				return getImportantBucketId(payload);
			});
			setLoading(false);

			const cachedIds =
				payload.grouped?.flatMap((group) =>
					group.threads.map((thread) => thread.id),
				) ?? [];
			void checkForNewMessages(cachedIds, {
				needsGoogleAuth: payload.needsGoogleAuth,
			});
			void loadThreads({
				background: true,
				showUpdatingBadge: payload.needsGoogleAuth === true,
				resolveGoogleConnection: payload.needsGoogleAuth === true,
			});
		} catch {
			void loadThreads();
		}
	}, [checkForNewMessages, loadThreads]);

	useEffect(() => {
		if (!data || typeof window === "undefined") {
			return;
		}
		window.localStorage.setItem(
			inboxCacheKey,
			JSON.stringify(normalizeInboxResponse(data)),
		);
	}, [data]);

	useEffect(() => {
		if (!data || data.needsGoogleAuth) {
			return;
		}

		const interval = window.setInterval(() => {
			void checkForNewMessages();
		}, 10_000);

		return () => {
			window.clearInterval(interval);
		};
	}, [checkForNewMessages, data]);

	const connectGoogle = useCallback(async () => {
		setError(null);
		const response = await fetch(convexApiUrl("/api/auth/google/start"), {
			method: "POST",
		});
		const payload = (await response.json()) as { url?: string; error?: string };
		if (!response.ok || !payload.url) {
			setError(payload.error ?? "Failed to start Google OAuth flow");
			return;
		}
		window.location.href = payload.url;
	}, []);

	const logout = useCallback(async () => {
		setError(null);

		const response = await fetch(convexApiUrl("/api/logout"), {
			method: "POST",
		});
		if (!response.ok) {
			setError("Failed to logout");
			return;
		}

		try {
			await authClient.signOut();
		} catch {
			// Continue reload even if there is no active Better Auth session.
		}
		if (typeof window !== "undefined") {
			window.localStorage.removeItem(inboxCacheKey);
		}
		window.location.reload();
	}, []);

	const recategorize = useCallback(
		async (options?: { errorMessage?: string }) => {
			setError(null);
			setUpdatingBadgeCount((count) => count + 1);
			try {
				const response = await fetch(convexApiUrl("/api/classify"), {
					method: "POST",
				});
				const payload = normalizeInboxResponse(
					(await response.json()) as InboxResponse,
				);
				if (!response.ok) {
					setError(
						options?.errorMessage ??
							payload.error ??
							"Failed to recategorize threads",
					);
					return;
				}
				setData(payload);
				setSelectedBucketId((current) => {
					if (
						current &&
						Array.isArray(payload.buckets) &&
						payload.buckets.some((bucket) => bucket.id === current)
					) {
						return current;
					}
					return getImportantBucketId(payload);
				});
			} catch {
				setError(options?.errorMessage ?? "Failed to recategorize threads");
			} finally {
				setUpdatingBadgeCount((count) => Math.max(0, count - 1));
			}
		},
		[],
	);

	const createCategory = useCallback(async () => {
		if (!newBucketName.trim()) {
			setError("Category name is required");
			return;
		}

		setError(null);
		setCategoryActionKey("create");
		const response = await fetch(convexApiUrl("/api/buckets"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: newBucketName.trim(),
				description: newBucketDescription.trim() || undefined,
			}),
		});

		const payload = normalizeInboxResponse(
			(await response.json()) as InboxResponse,
		);
		if (!response.ok) {
			setError("Failed to configure category");
			setCategoryActionKey(null);
			return;
		}

		setData(payload);
		const created = [...(Array.isArray(payload.buckets) ? payload.buckets : [])]
			.reverse()
			.find(
				(bucket) =>
					bucket.name === newBucketName.trim() && bucket.type === "custom",
			);
		setSelectedBucketId(created?.id ?? getImportantBucketId(payload));
		setShowConfigure(false);
		setNewBucketName("");
		setNewBucketDescription("");
		setCategoryActionKey(null);
		await recategorize({
			errorMessage: "Category saved, but failed to recategorize threads",
		});
	}, [newBucketDescription, newBucketName, recategorize]);

	const updateCategory = useCallback(
		async (bucket: BucketDefinition) => {
			const draft = categoryDrafts[bucket.id] ?? {
				name: bucket.name,
				description: bucket.description ?? "",
			};
			if (!draft.name.trim()) {
				setError("Category name is required");
				return;
			}

			setError(null);
			setCategoryActionKey(`save-${bucket.id}`);
			const response = await fetch(convexApiUrl("/api/buckets"), {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: bucket.id,
					name: draft.name.trim(),
					description: draft.description.trim() || undefined,
				}),
			});
			const payload = normalizeInboxResponse(
				(await response.json()) as InboxResponse,
			);
			if (!response.ok) {
				setError("Failed to update category");
				setCategoryActionKey(null);
				return;
			}

			setData(payload);
			setCategoryActionKey(null);
			await recategorize({
				errorMessage: "Category saved, but failed to recategorize threads",
			});
		},
		[categoryDrafts, recategorize],
	);

	const deleteCategory = useCallback(
		async (bucketId: string) => {
			setError(null);
			setCategoryActionKey(`delete-${bucketId}`);
			const response = await fetch(convexApiUrl("/api/buckets"), {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: bucketId }),
			});
			const payload = normalizeInboxResponse(
				(await response.json()) as InboxResponse,
			);
			if (!response.ok) {
				setError("Failed to delete category");
				setCategoryActionKey(null);
				return;
			}

			setData(payload);
			setSelectedBucketId((current) => {
				if (
					current &&
					Array.isArray(payload.buckets) &&
					payload.buckets.some((bucket) => bucket.id === current)
				) {
					return current;
				}
				return getImportantBucketId(payload);
			});
			setCategoryActionKey(null);
			await recategorize({
				errorMessage: "Category deleted, but failed to recategorize threads",
			});
		},
		[recategorize],
	);

	const refreshInbox = useCallback(async () => {
		await loadThreads({ background: true, showUpdatingBadge: true });
	}, [loadThreads]);

	const closeChat = useCallback(() => {
		setIsChatOpen(false);
		setChatError(null);
		setMessageError(null);
		setMessageDetail(null);
		setSelectedChatEmail(null);
	}, []);

	const searchChat = useCallback(async () => {
		const query = chatQuery.trim();
		if (query.length < 2) {
			setChatError("Please enter at least 2 characters.");
			return;
		}

		setChatLoading(true);
		setChatError(null);
		setMessageError(null);
		setMessageDetail(null);
		setSelectedChatEmail(null);
		try {
			const response = await fetch(convexApiUrl("/api/chat/search"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});
			const payload = (await response.json()) as ChatSearchResponse;
			if (!response.ok) {
				setChatError(payload.error ?? "Failed to search emails");
				setChatResults([]);
				return;
			}
			setChatResults(Array.isArray(payload.results) ? payload.results : []);
		} catch {
			setChatError("Failed to search emails");
			setChatResults([]);
		} finally {
			setChatLoading(false);
		}
	}, [chatQuery]);

	const loadMessageDetail = useCallback(async (email: ChatResultItem) => {
		setSelectedChatEmail(email);
		setMessageLoading(true);
		setMessageError(null);
		setMessageDetail(null);
		try {
			const response = await fetch(convexApiUrl("/api/messages/detail"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: email.id }),
			});
			const payload = (await response.json()) as MessageDetailResponse;
			if (!response.ok) {
				setMessageError(payload.error ?? "Failed to load email");
				return;
			}
			setMessageDetail(payload);
		} catch {
			setMessageError("Failed to load email");
		} finally {
			setMessageLoading(false);
		}
	}, []);

	const closeCategoryMessage = useCallback(() => {
		setIsCategoryMessageOpen(false);
		setSelectedCategoryEmail(null);
		setCategoryMessageDetail(null);
		setCategoryMessageError(null);
	}, []);

	const openCategoryMessage = useCallback(async (thread: BucketedThread) => {
		const email: ChatResultItem = {
			id: thread.id,
			subject: thread.subject,
			snippet: thread.snippet,
			receivedAt: thread.receivedAt,
		};
		setIsCategoryMessageOpen(true);
		setSelectedCategoryEmail(email);
		setCategoryMessageLoading(true);
		setCategoryMessageError(null);
		setCategoryMessageDetail(null);
		try {
			const response = await fetch(convexApiUrl("/api/messages/detail"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: email.id }),
			});
			const payload = (await response.json()) as MessageDetailResponse;
			if (!response.ok) {
				setCategoryMessageError(payload.error ?? "Failed to load email");
				return;
			}
			setCategoryMessageDetail(payload);
		} catch {
			setCategoryMessageError("Failed to load email");
		} finally {
			setCategoryMessageLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!isChatOpen && !isCategoryMessageOpen) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				if (isCategoryMessageOpen) {
					closeCategoryMessage();
					return;
				}
				closeChat();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [closeCategoryMessage, closeChat, isCategoryMessageOpen, isChatOpen]);

	const showSignInButton =
		data?.needsGoogleAuth === true ||
		(error?.toLowerCase().includes("gmail authorization expired") ?? false) ||
		(error?.toLowerCase().includes("google account is not connected") ?? false);

	if (loading && !data) {
		return (
			<>
				<Head>
					<title>Inbox Helper</title>
					<meta
						content="LLM-powered Gmail bucket categorization"
						name="description"
					/>
					<link href="/favicon.ico" rel="icon" />
				</Head>
				<main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-900">
					<SpinnerBadge />
				</main>
			</>
		);
	}

	return (
		<>
			<Head>
				<title>Inbox Helper</title>
				<meta
					content="LLM-powered Gmail bucket categorization"
					name="description"
				/>
				<link href="/favicon.ico" rel="icon" />
			</Head>
			<main className="min-h-screen bg-slate-100 text-slate-900">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
					<header className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<h1 className="font-bold text-3xl">Eagle Eye</h1>
						</div>
						<div className="flex gap-2">
							{showSignInButton ? (
								<button
									className={buttonClass}
									onClick={() => void connectGoogle()}
									type="button"
								>
									Sign in
								</button>
							) : null}
							<button
								className={buttonClass}
								onClick={() => setIsChatOpen(true)}
								type="button"
							>
								<MessageCircle className="mr-2 inline h-4 w-4" />
								Chat
							</button>
							<button
								className={buttonClass}
								onClick={() => void refreshInbox()}
								type="button"
							>
								<RefreshCw className="mr-2 inline h-4 w-4" />
								Refresh
							</button>
							<button
								className={buttonClass}
								onClick={() => void recategorize()}
								type="button"
							>
								<Sparkles className="mr-2 inline h-4 w-4" />
								Recategorize
							</button>
							<button
								className={buttonClass}
								onClick={() => void logout()}
								type="button"
							>
								<LogOut className="mr-2 inline h-4 w-4" />
								Logout
							</button>
						</div>
					</header>

					{isUpdatingBadgeVisible ? (
						<div className="flex justify-center">
							<SpinnerBadge />
						</div>
					) : null}

					{error ? <p className="text-red-600 text-sm">{error}</p> : null}

					{data?.needsGoogleAuth && !isResolvingGoogleConnection ? (
						<section className="rounded-lg border bg-white p-5">
							<p className="mb-3 text-slate-700 text-sm">
								Connect your Google Workspace account to grant Gmail access.
							</p>
							<button
								className={buttonClass}
								onClick={() => void connectGoogle()}
								type="button"
							>
								Connect Google Account
							</button>
						</section>
					) : null}

					{data && !data.needsGoogleAuth ? (
						<section className="grid gap-4 lg:grid-cols-4">
							<aside className="rounded-lg border bg-white p-4 lg:col-span-1">
								<h2 className="mb-3 font-semibold text-base">Categories</h2>
								<div className="flex flex-col gap-1">
									{orderedBuckets.map((bucket) => {
										const Icon = bucketIcon(bucket);
										const count =
											groupedByBucketId.get(bucket.id)?.threads.length ?? 0;
										const isSelected =
											!showConfigure && selectedBucketId === bucket.id;

										return (
											<button
												className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
													isSelected
														? "bg-slate-900 text-white"
														: "hover:bg-slate-100"
												}`}
												key={bucket.id}
												onClick={() => {
													setShowConfigure(false);
													setSelectedBucketId(bucket.id);
												}}
												type="button"
											>
												<span className="flex items-center gap-2">
													<Icon className="h-4 w-4" />
													{bucket.name}
												</span>
												<span
													className={`rounded-full px-2 py-0.5 text-xs ${
														isSelected ? "bg-white/20" : "bg-slate-100"
													}`}
												>
													{count}
												</span>
											</button>
										);
									})}

									<button
										className={`mt-2 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
											showConfigure
												? "bg-slate-900 text-white"
												: "hover:bg-slate-100"
										}`}
										onClick={() => setShowConfigure(true)}
										type="button"
									>
										<Settings2 className="h-4 w-4" />
										Configure categories
									</button>
								</div>
							</aside>

							<div className="rounded-lg border bg-white p-4 lg:col-span-3">
								{showConfigure ? (
									<div className="space-y-3">
										<h3 className="font-semibold text-lg">
											Configure categories
										</h3>
										<div className="flex flex-col gap-1">
											<label className="text-sm" htmlFor="category-name">
												Category name
											</label>
											<input
												className="rounded-md border px-3 py-2"
												id="category-name"
												onChange={(event) =>
													setNewBucketName(event.target.value)
												}
												placeholder="Eg. Follow Up"
												value={newBucketName}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<label className="text-sm" htmlFor="category-description">
												Description
											</label>
											<input
												className="rounded-md border px-3 py-2"
												id="category-description"
												onChange={(event) =>
													setNewBucketDescription(event.target.value)
												}
												placeholder="Emails that need follow-up"
												value={newBucketDescription}
											/>
										</div>
										<button
											className={buttonClass}
											disabled={categoryActionKey !== null}
											onClick={() => void createCategory()}
											type="button"
										>
											{categoryActionKey === "create"
												? "Creating..."
												: "Create category"}
										</button>

										<div className="pt-2">
											<h4 className="mb-2 font-medium text-sm">
												Existing categories
											</h4>
											<ul className="space-y-3">
												{orderedBuckets.map((bucket) => {
													const draft = categoryDrafts[bucket.id] ?? {
														name: bucket.name,
														description: bucket.description ?? "",
													};
													const saveKey = `save-${bucket.id}`;
													const deleteKey = `delete-${bucket.id}`;
													return (
														<li
															className="rounded-md border p-3"
															key={bucket.id}
														>
															<div className="space-y-2">
																<div className="flex flex-col gap-1">
																	<label
																		className="text-xs"
																		htmlFor={`bucket-name-${bucket.id}`}
																	>
																		Name
																	</label>
																	<input
																		className="rounded-md border px-2 py-1.5 text-sm"
																		id={`bucket-name-${bucket.id}`}
																		onChange={(event) =>
																			setCategoryDrafts((current) => ({
																				...current,
																				[bucket.id]: {
																					name: event.target.value,
																					description:
																						current[bucket.id]?.description ??
																						bucket.description ??
																						"",
																				},
																			}))
																		}
																		value={draft.name}
																	/>
																</div>
																<div className="flex flex-col gap-1">
																	<label
																		className="text-xs"
																		htmlFor={`bucket-description-${bucket.id}`}
																	>
																		Description
																	</label>
																	<input
																		className="rounded-md border px-2 py-1.5 text-sm"
																		id={`bucket-description-${bucket.id}`}
																		onChange={(event) =>
																			setCategoryDrafts((current) => ({
																				...current,
																				[bucket.id]: {
																					name:
																						current[bucket.id]?.name ??
																						bucket.name,
																					description: event.target.value,
																				},
																			}))
																		}
																		value={draft.description}
																	/>
																</div>
																<div className="flex gap-2">
																	<button
																		className={buttonClass}
																		disabled={categoryActionKey !== null}
																		onClick={() => void updateCategory(bucket)}
																		type="button"
																	>
																		{categoryActionKey === saveKey
																			? "Saving..."
																			: "Save"}
																	</button>
																	<button
																		className="cursor-pointer rounded-md border border-red-300 px-4 py-2 text-red-700 text-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
																		disabled={categoryActionKey !== null}
																		onClick={() =>
																			void deleteCategory(bucket.id)
																		}
																		type="button"
																	>
																		{categoryActionKey === deleteKey
																			? "Deleting..."
																			: "Delete"}
																	</button>
																</div>
															</div>
														</li>
													);
												})}
											</ul>
										</div>
									</div>
								) : selectedGroup ? (
									<>
										<div className="mb-3 flex items-center justify-between">
											<h3 className="font-semibold text-lg">
												{selectedGroup.bucket.name}
											</h3>
											<span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
												{selectedGroup.threads.length}
											</span>
										</div>
										<ul className="space-y-3">
											{selectedGroup.threads.map((thread) => (
												<li
													className="border-b pb-2 last:border-b-0"
													key={thread.id}
												>
													<button
														className="w-full cursor-pointer text-left hover:bg-slate-50 rounded-md p-2"
														onClick={() => void openCategoryMessage(thread)}
														type="button"
													>
														<div className="flex items-start justify-between gap-2">
															<p className="truncate font-medium text-sm">
																{thread.subject}
															</p>
															{typeof thread.receivedAt === "number" ? (
																<p className="shrink-0 text-slate-500 text-xs">
																	{formatThreadDate(thread.receivedAt)}
																</p>
															) : null}
														</div>
														<p
															className="mt-1 overflow-hidden text-slate-500 text-sm leading-5"
															style={{
																display: "-webkit-box",
																WebkitBoxOrient: "vertical",
																WebkitLineClamp: 2,
															}}
														>
															{thread.snippet}
														</p>
													</button>
												</li>
											))}
											{selectedGroup.threads.length === 0 ? (
												<li className="text-slate-500 text-xs">
													No threads in this bucket
												</li>
											) : null}
										</ul>
									</>
								) : (
									<p className="text-slate-500 text-sm">
										Select a category to view messages.
									</p>
								)}
							</div>
						</section>
					) : null}
				</div>
				{isChatOpen ? (
					<div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-3 sm:p-6">
						<div className="h-[88vh] w-[95vw] overflow-hidden rounded-lg border bg-white shadow-xl md:w-1/2">
							<div className="flex items-center justify-between border-b px-4 py-3">
								<h2 className="font-semibold text-base">Chat</h2>
								<button
									className="cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
									onClick={closeChat}
									type="button"
								>
									<X className="h-4 w-4" />
								</button>
							</div>
							<div className="flex h-[calc(100%-53px)] flex-col">
								<div className="space-y-3 border-b p-4">
									<p className="text-slate-600 text-sm">
										Find relevant emails using natural language
									</p>
									<div className="flex gap-2">
										<input
											className="w-full rounded-md border px-3 py-2 text-sm"
											onChange={(event) => setChatQuery(event.target.value)}
											onKeyDown={(event) => {
												if (event.key === "Enter") {
													event.preventDefault();
													void searchChat();
												}
											}}
											placeholder='Try "show me emails from sabih"'
											value={chatQuery}
										/>
										<button
											className={buttonClass}
											disabled={chatLoading}
											onClick={() => void searchChat()}
											type="button"
										>
											{chatLoading ? "Searching..." : "Search"}
										</button>
									</div>
									{chatError ? (
										<p className="text-red-600 text-xs">{chatError}</p>
									) : null}
								</div>
								<div className="flex-1 overflow-y-auto p-4">
									{selectedChatEmail ? (
										<div className="flex h-full min-h-0 flex-col gap-3">
											<button
												className="inline-flex items-center gap-1 text-slate-600 text-xs hover:text-slate-900 cursor-pointer"
												onClick={() => {
													setSelectedChatEmail(null);
													setMessageDetail(null);
													setMessageError(null);
												}}
												type="button"
											>
												<ArrowLeft className="h-3.5 w-3.5" />
												Back to results
											</button>
											<div>
												<p className="break-words font-medium text-sm whitespace-normal">
													{messageDetail?.subject ?? selectedChatEmail.subject}
												</p>
												{messageDetail?.from ? (
													<p className="break-words text-slate-500 text-xs whitespace-normal">
														{messageDetail.from}
													</p>
												) : selectedChatEmail.sender ? (
													<p className="break-words text-slate-500 text-xs whitespace-normal">
														{selectedChatEmail.sender}
													</p>
												) : null}
											</div>
											{messageLoading ? (
												<p className="text-slate-500 text-sm">
													Loading email...
												</p>
											) : messageError ? (
												<p className="text-red-600 text-sm">{messageError}</p>
											) : messageDetail ? (
												<iframe
													className="h-full min-h-0 w-full flex-1 rounded-md border"
													sandbox=""
													srcDoc={buildMessageSrcDoc(messageDetail.html)}
													title={`message-${messageDetail.id}`}
												/>
											) : (
												<p className="text-slate-500 text-sm">
													No email content available.
												</p>
											)}
										</div>
									) : (
										<ul className="space-y-3">
											{chatResults.map((email) => (
												<li key={email.id}>
													<button
														className="w-full cursor-pointer rounded-md border p-3 text-left hover:bg-slate-50"
														onClick={() => void loadMessageDetail(email)}
														type="button"
													>
														<div className="flex items-start justify-between gap-2">
															<p className="break-words font-medium text-sm whitespace-normal">
																{email.subject}
															</p>
															{typeof email.receivedAt === "number" ? (
																<p className="shrink-0 text-slate-500 text-xs">
																	{formatThreadDate(email.receivedAt)}
																</p>
															) : null}
														</div>
														{email.sender ? (
															<p className="mt-0.5 break-words text-slate-500 text-xs whitespace-normal">
																{email.sender}
															</p>
														) : null}
														<p className="mt-1 break-words text-slate-600 text-sm whitespace-normal">
															{email.snippet}
														</p>
													</button>
												</li>
											))}
											{!chatLoading && chatResults.length === 0 ? (
												<li className="text-slate-500 text-sm">
													Run a search to see matching emails.
												</li>
											) : null}
										</ul>
									)}
								</div>
							</div>
						</div>
					</div>
				) : null}
				{isCategoryMessageOpen && selectedCategoryEmail ? (
					<div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-3 sm:p-6">
						<div className="h-[88vh] w-[95vw] overflow-hidden rounded-lg border bg-white shadow-xl md:w-1/2">
							<div className="flex items-center justify-between border-b px-4 py-3">
								<h2 className="font-semibold text-base">Email</h2>
								<button
									className="cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
									onClick={closeCategoryMessage}
									type="button"
								>
									<X className="h-4 w-4" />
								</button>
							</div>
							<div className="flex h-[calc(100%-53px)] flex-col gap-3 p-4">
								<div>
									<p className="break-words font-medium text-sm whitespace-normal">
										{categoryMessageDetail?.subject ??
											selectedCategoryEmail.subject}
									</p>
									{categoryMessageDetail?.from ? (
										<p className="break-words text-slate-500 text-xs whitespace-normal">
											{categoryMessageDetail.from}
										</p>
									) : null}
								</div>
								{categoryMessageLoading ? (
									<p className="text-slate-500 text-sm">Loading email...</p>
								) : categoryMessageError ? (
									<p className="text-red-600 text-sm">{categoryMessageError}</p>
								) : categoryMessageDetail ? (
									<iframe
										className="h-full min-h-0 w-full flex-1 rounded-md border"
										sandbox=""
										srcDoc={buildMessageSrcDoc(categoryMessageDetail.html)}
										title={`message-${categoryMessageDetail.id}`}
									/>
								) : (
									<p className="text-slate-500 text-sm">
										No email content available.
									</p>
								)}
							</div>
						</div>
					</div>
				) : null}
			</main>
		</>
	);
}
