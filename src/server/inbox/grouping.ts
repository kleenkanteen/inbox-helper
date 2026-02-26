import type {
	BucketDefinition,
	BucketedThreads,
	ThreadClassification,
	ThreadSummary,
} from "#/server/inbox/types";

export const groupThreadsByBucket = ({
	buckets,
	threads,
	classifications,
}: {
	buckets: BucketDefinition[];
	threads: ThreadSummary[];
	classifications: ThreadClassification[];
}): BucketedThreads[] => {
	const byThreadId = new Map(threads.map((thread) => [thread.id, thread]));
	const grouped = new Map<string, BucketedThreads>();

	for (const bucket of buckets) {
		grouped.set(bucket.id, { bucket, threads: [] });
	}

	for (const classification of classifications) {
		const thread = byThreadId.get(classification.threadId);
		const container = grouped.get(classification.bucketId);
		if (!thread || !container) {
			continue;
		}
		container.threads.push({
			...thread,
			confidence: classification.confidence,
		});
	}

	return [...grouped.values()];
};
