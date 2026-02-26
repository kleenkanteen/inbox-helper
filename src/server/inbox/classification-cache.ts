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
	const cached = (await convexQuery("inbox:getCachedClassifications", {
		userId,
		emailIds: uniqueEmailIds,
	})) as CachedClassification[];

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

	if (newlyClassified.length > 0) {
		const entries = newlyClassified.map((classification) => ({
			emailId: classification.threadId,
			bucketId: classification.bucketId,
			confidence: classification.confidence,
			reason: classification.reason,
		}));

		if (entries.length > 0) {
			await convexMutation("inbox:upsertCachedClassifications", {
				userId,
				entries,
			});
		}
	}

	const classificationByThreadId = new Map(
		[...seen, ...newlyClassified].map((classification) => [
			classification.threadId,
			classification,
		]),
	);

	return threads.map((thread) => {
		const classification = classificationByThreadId.get(thread.id);
		if (!classification) {
			throw new Error(`Missing classification for thread ${thread.id}`);
		}
		return classification;
	});
};
