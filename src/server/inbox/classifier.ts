import type {
	BucketDefinition,
	ThreadClassification,
	ThreadSummary,
} from "#/server/inbox/types";

const normalize = (value: string) => value.toLowerCase();

const keywordHeuristic = (
	thread: ThreadSummary,
	buckets: BucketDefinition[],
): ThreadClassification => {
	const subject = normalize(thread.subject);
	const snippet = normalize(thread.snippet);
	const text = `${subject} ${snippet}`;

	const newsletter = buckets.find((bucket) =>
		bucket.name.toLowerCase().includes("newsletter"),
	);
	if (newsletter && (text.includes("unsubscribe") || text.includes("digest"))) {
		return {
			threadId: thread.id,
			bucketId: newsletter.id,
			confidence: 0.95,
			reason: "Newsletter markers detected",
		};
	}

	const important = buckets.find((bucket) =>
		bucket.name.toLowerCase().includes("important"),
	);
	if (
		important &&
		(text.includes("urgent") ||
			text.includes("asap") ||
			text.includes("action required"))
	) {
		return {
			threadId: thread.id,
			bucketId: important.id,
			confidence: 0.9,
			reason: "Urgency markers detected",
		};
	}

	const autoArchive = buckets.find((bucket) =>
		bucket.name.toLowerCase().includes("archive"),
	);
	if (
		autoArchive &&
		(text.includes("receipt") || text.includes("notification"))
	) {
		return {
			threadId: thread.id,
			bucketId: autoArchive.id,
			confidence: 0.8,
			reason: "Low value signal detected",
		};
	}

	const fallback =
		buckets.find((bucket) => bucket.name.toLowerCase().includes("wait")) ??
		buckets[0];
	if (!fallback) {
		throw new Error("No fallback bucket available");
	}
	return {
		threadId: thread.id,
		bucketId: fallback.id,
		confidence: 0.6,
		reason: "Default fallback",
	};
};

export const classifyThreads = async (
	threads: ThreadSummary[],
	buckets: BucketDefinition[],
): Promise<ThreadClassification[]> => {
	if (!buckets.length) {
		throw new Error("At least one bucket is required for classification");
	}

	return threads.map((thread) => keywordHeuristic(thread, buckets));
};
