import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { generateObject } from "ai";
import { z } from "zod";

import { env } from "#/env";
import type {
	BucketDefinition,
	ThreadClassification,
	ThreadSummary,
} from "#/server/inbox/types";

const XAI_MODEL_ID = "grok-4-1-fast-non-reasoning";
const OPENAI_MODEL_ID = "gpt-4o-mini";
const MAX_THREADS = 200;
const BATCH_SIZE = 15;
const PREVIEW_LIMIT = 300;
const MODEL_TIMEOUT_MS = 45000;

const truncatePreview = (value: string) => value.slice(0, PREVIEW_LIMIT);

const classificationSchema = z.object({
	classifications: z.array(
		z.object({
			threadId: z.string(),
			bucketId: z.string(),
			confidence: z.number().min(0).max(1),
			reason: z.string().max(240),
		}),
	),
});

const classifyWithModel = async ({
	model,
	threads,
	buckets,
}: {
	model: Parameters<typeof generateObject>[0]["model"];
	threads: ThreadSummary[],
	buckets: BucketDefinition[];
}): Promise<ThreadClassification[]> => {
	const normalizedThreads = threads.slice(0, MAX_THREADS).map((thread) => ({
		threadId: thread.id,
		subject: thread.subject.trim() || "(No Subject)",
		snippet: truncatePreview(thread.snippet),
	}));

	const bucketIndex = buckets.map((bucket) => ({
		id: bucket.id,
		name: bucket.name,
		description: bucket.description ?? "",
	}));

	const { object } = await generateObject({
		model,
		schema: classificationSchema,
		temperature: 0,
		system:
			"You classify email threads into buckets. Only use the provided subject and preview. Never infer from sender or missing fields.",
		prompt: `Classify every thread into exactly one bucket.\n\nBuckets:\n${JSON.stringify(bucketIndex)}\n\nThreads:\n${JSON.stringify(normalizedThreads)}\n\nReturn one classification per thread. Each classification must include the exact threadId from the input. bucketId must be one of the provided bucket ids. reason must always be present as a short string (use an empty string when no reason is needed).`,
	});

	const allowedBucketIds = new Set(buckets.map((bucket) => bucket.id));
	const byThreadId = new Map(
		object.classifications.map((classification) => [
			classification.threadId,
			classification,
		]),
	);

	return normalizedThreads.map((thread) => {
		const fromModel = byThreadId.get(thread.threadId);
		if (!fromModel) {
			throw new Error(`Missing classification for thread ${thread.threadId}`);
		}
		if (!allowedBucketIds.has(fromModel.bucketId)) {
			throw new Error(
				`Invalid bucketId '${fromModel.bucketId}' for thread ${thread.threadId}`,
			);
		}
		return {
			threadId: thread.threadId,
			bucketId: fromModel.bucketId,
			confidence: fromModel.confidence,
			reason: fromModel.reason || undefined,
		};
	});
};

const withTimeout = async <T>(
	promise: Promise<T>,
	ms: number,
	label: string,
): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<T>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(`${label} timed out after ${ms}ms`));
		}, ms);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
};

export const classifyThreads = async (
	threads: ThreadSummary[],
	buckets: BucketDefinition[],
): Promise<ThreadClassification[]> => {
	if (!buckets.length) {
		throw new Error("At least one bucket is required for classification");
	}

	const limited = threads.slice(0, MAX_THREADS).map((thread) => ({
		...thread,
		snippet: truncatePreview(thread.snippet),
	}));

	const errors: string[] = [];
	const fallbackBucket =
		buckets.find((bucket) => bucket.name === "Can Wait") ?? buckets[0];
	if (!fallbackBucket) {
		throw new Error("At least one bucket is required for fallback");
	}

	const classifyInBatches = async (
		model: Parameters<typeof generateObject>[0]["model"],
		label: string,
	) => {
		const results: ThreadClassification[] = [];
		for (let index = 0; index < limited.length; index += BATCH_SIZE) {
			const batch = limited.slice(index, index + BATCH_SIZE);
			const batchResult = await withTimeout(
				classifyWithModel({
					model,
					threads: batch,
					buckets,
				}),
				MODEL_TIMEOUT_MS,
				`${label} batch ${index / BATCH_SIZE + 1}`,
			);
			results.push(...batchResult);
		}
		return results;
	};

	try {
		if (!env.XAI_API_KEY) {
			throw new Error("Missing XAI_API_KEY");
		}
		const xai = createXai({ apiKey: env.XAI_API_KEY });
		return await classifyInBatches(xai(XAI_MODEL_ID), "xAI classification");
	} catch (error) {
		errors.push(`xAI failed: ${(error as Error).message}`);
	}

	try {
		if (!env.OPENAI_API_KEY) {
			throw new Error("Missing OPENAI_API_KEY");
		}
		const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
		return await classifyInBatches(
			openai(OPENAI_MODEL_ID),
			"OpenAI classification",
		);
	} catch (error) {
		errors.push(`OpenAI failed: ${(error as Error).message}`);
	}

	// Graceful degradation when model providers are unavailable:
	// assign every thread to a stable fallback bucket instead of failing the request.
	return limited.map((thread) => ({
		threadId: thread.id,
		bucketId: fallbackBucket.id,
		confidence: 0.2,
		reason: `Fallback classification. ${errors.join(" | ")}`.slice(0, 240),
	}));
};
