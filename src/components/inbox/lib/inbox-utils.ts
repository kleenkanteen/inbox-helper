import {
	AlertCircle,
	Archive,
	Clock3,
	type LucideIcon,
	Newspaper,
	Tag,
} from "lucide-react";
import { defaultBucketOrder } from "#/components/inbox/lib/inbox-constants";
import type {
	BucketDefinition,
	BucketedThread,
	InboxResponse,
} from "#/components/inbox/types/inbox-types";

export const getImportantBucketId = (
	payload: InboxResponse | null,
): string | null => {
	if (!payload || !Array.isArray(payload.buckets)) {
		return null;
	}
	const important = payload.buckets.find(
		(bucket) => bucket.name === "Important",
	);
	return important?.id ?? payload.buckets[0]?.id ?? null;
};

export const bucketIcon = (bucket: BucketDefinition): LucideIcon => {
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

export const getOrderedBuckets = (buckets: BucketDefinition[]) => {
	const orderIndex = new Map(
		defaultBucketOrder.map((name, index) => [name, index]),
	);
	return [...buckets].sort((left, right) => {
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
};

export const formatThreadDate = (receivedAt?: number) => {
	if (!receivedAt || !Number.isFinite(receivedAt)) {
		return "";
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	}).format(new Date(receivedAt));
};

export const buildMessageSrcDoc = (rawHtml: string) => `<!doctype html>
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

export const sortThreadsByRecency = (
	left: BucketedThread,
	right: BucketedThread,
) => {
	const leftTime = typeof left.receivedAt === "number" ? left.receivedAt : 0;
	const rightTime = typeof right.receivedAt === "number" ? right.receivedAt : 0;
	if (leftTime !== rightTime) {
		return rightTime - leftTime;
	}
	return left.id.localeCompare(right.id);
};

export const normalizeInboxResponse = (
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
