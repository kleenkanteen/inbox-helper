import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	checkNewMessages,
	classifyInbox,
	createBucket,
	deleteBucket,
	getThreads,
	logoutRequest,
	startGoogleAuth,
	updateBucket,
} from "#/components/inbox/lib/inbox-api";
import { inboxCacheKey } from "#/components/inbox/lib/inbox-constants";
import {
	getImportantBucketId,
	getOrderedBuckets,
	normalizeInboxResponse,
} from "#/components/inbox/lib/inbox-utils";
import type {
	BucketDefinition,
	CategoryDraft,
	InboxResponse,
} from "#/components/inbox/types/inbox-types";
import { authClient } from "#/server/better-auth/client";

type LoadThreadsOptions = {
	background?: boolean;
	showUpdatingBadge?: boolean;
	resolveGoogleConnection?: boolean;
};

export const useInboxData = () => {
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
		Record<string, CategoryDraft>
	>({});
	const [categoryActionKey, setCategoryActionKey] = useState<string | null>(
		null,
	);

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
		return getOrderedBuckets(data.buckets);
	}, [data]);

	const selectedGroup = useMemo(() => {
		if (!selectedBucketId) {
			return null;
		}
		return groupedByBucketId.get(selectedBucketId) ?? null;
	}, [groupedByBucketId, selectedBucketId]);

	const loadThreads = useCallback(async (options?: LoadThreadsOptions) => {
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
			const { ok, payload } = await getThreads(200);
			const normalizedPayload = normalizeInboxResponse(payload);
			if (!ok) {
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
		} catch {
			setError("Failed to load inbox");
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
	}, []);

	const checkForNewThreads = useCallback(
		async (ids?: string[], options?: { needsGoogleAuth?: boolean }) => {
			if (options?.needsGoogleAuth ?? data?.needsGoogleAuth) {
				return;
			}

			try {
				const { ok, payload } = await checkNewMessages(ids ?? knownThreadIds);
				if (!ok) {
					return;
				}
				if (payload.needsGoogleAuth) {
					return;
				}

				if (payload.hasNew) {
					await loadThreads({ background: true });
				}
			} catch {
				// Ignore polling errors and keep current UI state.
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
			void checkForNewThreads(cachedIds, {
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
	}, [checkForNewThreads, loadThreads]);

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
			void checkForNewThreads();
		}, 10_000);

		return () => {
			window.clearInterval(interval);
		};
	}, [checkForNewThreads, data]);

	const connectGoogle = useCallback(async () => {
		setError(null);
		try {
			const { ok, payload } = await startGoogleAuth();
			if (!ok || !payload.url) {
				setError(payload.error ?? "Failed to start Google OAuth flow");
				return;
			}
			window.location.href = payload.url;
		} catch {
			setError("Failed to start Google OAuth flow");
		}
	}, []);

	const logout = useCallback(async () => {
		setError(null);

		try {
			const { ok } = await logoutRequest();
			if (!ok) {
				setError("Failed to logout");
				return;
			}
		} catch {
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
				const { ok, payload: rawPayload } = await classifyInbox();
				const payload = normalizeInboxResponse(rawPayload);
				if (!ok) {
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
		const trimmedName = newBucketName.trim();
		if (!trimmedName) {
			setError("Category name is required");
			return;
		}

		setError(null);
		setCategoryActionKey("create");
		try {
			const { ok, payload: rawPayload } = await createBucket({
				name: trimmedName,
				description: newBucketDescription.trim() || undefined,
			});
			const payload = normalizeInboxResponse(rawPayload);
			if (!ok) {
				setError("Failed to configure category");
				setCategoryActionKey(null);
				return;
			}

			setData(payload);
			const created = [
				...(Array.isArray(payload.buckets) ? payload.buckets : []),
			]
				.reverse()
				.find(
					(bucket) => bucket.name === trimmedName && bucket.type === "custom",
				);
			setSelectedBucketId(created?.id ?? getImportantBucketId(payload));
			setShowConfigure(false);
			setNewBucketName("");
			setNewBucketDescription("");
			setCategoryActionKey(null);
			await recategorize({
				errorMessage: "Category saved, but failed to recategorize threads",
			});
		} catch {
			setError("Failed to configure category");
			setCategoryActionKey(null);
		}
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
			try {
				const { ok, payload: rawPayload } = await updateBucket({
					id: bucket.id,
					name: draft.name.trim(),
					description: draft.description.trim() || undefined,
				});
				const payload = normalizeInboxResponse(rawPayload);
				if (!ok) {
					setError("Failed to update category");
					setCategoryActionKey(null);
					return;
				}

				setData(payload);
				setCategoryActionKey(null);
				await recategorize({
					errorMessage: "Category saved, but failed to recategorize threads",
				});
			} catch {
				setError("Failed to update category");
				setCategoryActionKey(null);
			}
		},
		[categoryDrafts, recategorize],
	);

	const deleteCategoryById = useCallback(
		async (bucketId: string) => {
			setError(null);
			setCategoryActionKey(`delete-${bucketId}`);
			try {
				const { ok, payload: rawPayload } = await deleteBucket(bucketId);
				const payload = normalizeInboxResponse(rawPayload);
				if (!ok) {
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
			} catch {
				setError("Failed to delete category");
				setCategoryActionKey(null);
			}
		},
		[recategorize],
	);

	const refreshInbox = useCallback(async () => {
		await loadThreads({ background: true, showUpdatingBadge: true });
	}, [loadThreads]);

	const openConfigure = useCallback(() => {
		setShowConfigure(true);
	}, []);

	const selectBucket = useCallback((bucketId: string) => {
		setShowConfigure(false);
		setSelectedBucketId(bucketId);
	}, []);

	const setCategoryDraft = useCallback(
		(bucketId: string, draft: CategoryDraft) => {
			setCategoryDrafts((current) => ({
				...current,
				[bucketId]: draft,
			}));
		},
		[],
	);

	const showSignInButton =
		data?.needsGoogleAuth === true ||
		(error?.toLowerCase().includes("gmail authorization expired") ?? false) ||
		(error?.toLowerCase().includes("google account is not connected") ?? false);

	return {
		data,
		loading,
		isUpdatingBadgeVisible,
		isResolvingGoogleConnection,
		error,
		selectedBucketId,
		showConfigure,
		newBucketName,
		newBucketDescription,
		categoryDrafts,
		categoryActionKey,
		groupedByBucketId,
		orderedBuckets,
		selectedGroup,
		showSignInButton,
		setNewBucketName,
		setNewBucketDescription,
		setCategoryDraft,
		connectGoogle,
		logout,
		recategorize,
		refreshInbox,
		createCategory,
		updateCategory,
		deleteCategoryById,
		openConfigure,
		selectBucket,
	};
};
