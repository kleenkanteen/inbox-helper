import { convexMutation, convexQuery } from "#/server/convex/client";
import { classifyThreads } from "#/server/inbox/classifier";
import type {
	BucketDefinition,
	ThreadClassification,
	ThreadSummary,
} from "#/server/inbox/types";

type CachedClassification = {
	emailId: string;
	bucketId: string;
	confidence: number;
	reason?: string;
};

const upsertCachedClassifications = async ({
	userId,
	classifications,
}: {
	userId: string;
	classifications: ThreadClassification[];
}) => {
	const entries = classifications.map((classification) => ({
		emailId: classification.threadId,
		bucketId: classification.bucketId,
		confidence: classification.confidence,
		reason: classification.reason,
	}));

	if (entries.length === 0) {
		return;
	}

	try {
		await convexMutation("inbox:upsertCachedClassifications", {
			userId,
			entries,
		});
	} catch {
		// Cache failures should not block serving classified inbox results.
	}
};

export const classifyUnseenThreads = async ({
	userId,
	threads,
	buckets,
}: {
	userId: string;
	threads: ThreadSummary[];
	buckets: BucketDefinition[];
}): Promise<ThreadClassification[]> => {
	const uniqueEmailIds = [...new Set(threads.map((thread) => thread.id))];
	let cached: CachedClassification[] = [];
	try {
		cached = (await convexQuery("inbox:getCachedClassifications", {
			userId,
			emailIds: uniqueEmailIds,
		})) as CachedClassification[];
	} catch {
		cached = [];
	}

	const validBucketIds = new Set(buckets.map((bucket) => bucket.id));
	const cacheByEmailId = new Map(
		cached
			.filter((entry) => validBucketIds.has(entry.bucketId))
			.map((entry) => [entry.emailId, entry]),
	);

	const seen: ThreadClassification[] = [];
	const unseen: ThreadSummary[] = [];

	for (const thread of threads) {
		const cachedEntry = cacheByEmailId.get(thread.id);
		if (!cachedEntry) {
			unseen.push(thread);
			continue;
		}
		seen.push({
			threadId: thread.id,
			bucketId: cachedEntry.bucketId,
			confidence: cachedEntry.confidence,
			reason: cachedEntry.reason,
		});
	}

	const newlyClassified = unseen.length
		? await classifyThreads(unseen, buckets)
		: [];

	await upsertCachedClassifications({ userId, classifications: newlyClassified });

	const classificationByThreadId = new Map(
		[...seen, ...newlyClassified].map((classification) => [
			classification.threadId,
			classification,
		]),
	);

	return threads.map((thread) => {
		const classification = classificationByThreadId.get(thread.id);
		if (!classification) {
			const fallbackBucketId = buckets.find((bucket) => bucket.name === "Can Wait")
				?.id ?? buckets[0]?.id;
			if (!fallbackBucketId) {
				throw new Error(`Missing classification for thread ${thread.id}`);
			}
			return {
				threadId: thread.id,
				bucketId: fallbackBucketId,
				confidence: 0.1,
				reason: "Fallback assignment due to missing classification.",
			};
		}
		return classification;
	});
};

export const classifyAllThreads = async ({
	userId,
	threads,
	buckets,
}: {
	userId: string;
	threads: ThreadSummary[];
	buckets: BucketDefinition[];
}): Promise<ThreadClassification[]> => {
	const classifications = threads.length
		? await classifyThreads(threads, buckets)
		: [];

	await upsertCachedClassifications({ userId, classifications });
	return classifications;
};
