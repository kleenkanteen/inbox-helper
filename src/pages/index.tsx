import {
	AlertCircle,
	Archive,
	Clock3,
	LogOut,
	Newspaper,
	RefreshCw,
	Settings2,
	Sparkles,
	Tag,
} from "lucide-react";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
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
	newCount: number;
	latestIds: string[];
	needsGoogleAuth?: boolean;
	error?: string;
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

export default function Home() {
	const [data, setData] = useState<InboxResponse | null>(null);
	const [loading, setLoading] = useState(true);
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
	const [hasNewMessages, setHasNewMessages] = useState(false);
	const [newMessageCount, setNewMessageCount] = useState(0);

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

	const loadThreads = useCallback(async () => {
		setLoading(true);
		setError(null);
		const response = await fetch(convexApiUrl("/api/threads?limit=200"), {
			method: "GET",
			cache: "no-store",
		});
		const payload = (await response.json()) as InboxResponse;
		if (!response.ok) {
			setData(payload);
			setError(payload.error ?? "Failed to load inbox");
			setLoading(false);
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
		setHasNewMessages(false);
		setNewMessageCount(0);
		setLoading(false);
	}, []);

	const checkForNewMessages = useCallback(
		async (ids?: string[]) => {
			if (!data || data.needsGoogleAuth) {
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

			setHasNewMessages(payload.hasNew);
			setNewMessageCount(payload.newCount);
		},
		[data, knownThreadIds],
	);

	useEffect(() => {
		void loadThreads();
	}, [loadThreads]);

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
		window.location.reload();
	}, []);

	const recategorize = useCallback(async () => {
		setError(null);
		const response = await fetch(convexApiUrl("/api/classify"), {
			method: "POST",
		});
		const payload = (await response.json()) as InboxResponse;
		if (!response.ok) {
			setError(payload.error ?? "Failed to recategorize threads");
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
	}, []);

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

		const payload = (await response.json()) as InboxResponse;
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
		setHasNewMessages(false);
		setNewMessageCount(0);
		setCategoryActionKey(null);
	}, [newBucketDescription, newBucketName]);

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
			const payload = (await response.json()) as InboxResponse;
			if (!response.ok) {
				setError("Failed to update category");
				setCategoryActionKey(null);
				return;
			}

			setData(payload);
			setCategoryActionKey(null);
		},
		[categoryDrafts],
	);

	const deleteCategory = useCallback(async (bucketId: string) => {
		setError(null);
		setCategoryActionKey(`delete-${bucketId}`);
		const response = await fetch(convexApiUrl("/api/buckets"), {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: bucketId }),
		});
		const payload = (await response.json()) as InboxResponse;
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
	}, []);

	const refreshInbox = useCallback(async () => {
		await checkForNewMessages();
		await loadThreads();
	}, [checkForNewMessages, loadThreads]);

	const showSignInButton =
		data?.needsGoogleAuth === true ||
		(error?.toLowerCase().includes("gmail authorization expired") ?? false) ||
		(error?.toLowerCase().includes("google account is not connected") ?? false);

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
							{hasNewMessages ? (
								<div className="mt-2 flex items-center gap-2">
									<SpinnerBadge />
									<span className="text-slate-600 text-xs">
										{newMessageCount} new message
										{newMessageCount === 1 ? "" : "s"}
									</span>
								</div>
							) : null}
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

					{loading ? <p>Loading inbox...</p> : null}
					{error ? <p className="text-red-600 text-sm">{error}</p> : null}

					{data?.needsGoogleAuth ? (
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
						<section className="grid gap-4 lg:grid-cols-2">
							<aside className="rounded-lg border bg-white p-4">
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

							<div className="rounded-lg border bg-white p-4">
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
			</main>
		</>
	);
}
