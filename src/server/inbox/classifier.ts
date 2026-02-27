import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { generateObject } from "ai";
import { z } from "zod";

import type {
	BucketDefinition,
	ThreadClassification,
	ThreadSummary,
} from "#/server/inbox/types";

const XAI_MODEL_ID = "grok-4-1-fast-non-reasoning";
const OPENAI_MODEL_ID = "gpt-4o-mini";
const MAX_THREADS = 200;
const PREVIEW_LIMIT = 300;
const MODEL_TIMEOUT_MS = 45000;
const MAX_CONCURRENT_CLASSIFICATIONS = 12;

const getEnv = (key: string) => {
	const value = process.env[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
};

const truncatePreview = (value: string) => value.slice(0, PREVIEW_LIMIT);

const classificationSchema = z.object({
	bucketId: z.string(),
	confidence: z.number().min(0).max(1),
	reason: z.string().max(240),
});

const classifySingleThreadWithModel = async ({
	model,
	thread,
	buckets,
}: {
	model: Parameters<typeof generateObject>[0]["model"];
	thread: ThreadSummary;
	buckets: BucketDefinition[];
}): Promise<ThreadClassification> => {
	const normalizedThread = {
		threadId: thread.id,
		subject: thread.subject.trim() || "(No Subject)",
		snippet: truncatePreview(thread.snippet),
	};
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
		prompt: `Classify exactly one thread into exactly one bucket.\n\nBuckets:\n${JSON.stringify(bucketIndex)}\n\nThread:\n${JSON.stringify(normalizedThread)}\n\nReturn only bucketId, confidence, and reason. bucketId must be one of the provided bucket ids. reason must always be present as a short string (use an empty string when no reason is needed).`,
	});

	const allowedBucketIds = new Set(buckets.map((bucket) => bucket.id));
	if (!allowedBucketIds.has(object.bucketId)) {
		throw new Error(
			`Invalid bucketId '${object.bucketId}' for thread ${normalizedThread.threadId}`,
		);
	}
	return {
		threadId: normalizedThread.threadId,
		bucketId: object.bucketId,
		confidence: object.confidence,
		reason: object.reason || undefined,
	};
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

	const classifyInParallel = async (
		model: Parameters<typeof generateObject>[0]["model"],
		label: string,
	) => {
		const results = new Array<ThreadClassification>(limited.length);
		const maxConcurrent = Math.max(
			1,
			Math.min(MAX_CONCURRENT_CLASSIFICATIONS, limited.length),
		);
		let nextIndex = 0;

		const worker = async () => {
			while (nextIndex < limited.length) {
				const index = nextIndex;
				nextIndex += 1;
				const thread = limited[index];
				if (!thread) {
					continue;
				}
				const classified = await withTimeout(
					classifySingleThreadWithModel({
						model,
						thread,
						buckets,
					}),
					MODEL_TIMEOUT_MS,
					`${label} thread ${thread.id}`,
				);
				results[index] = classified;
			}
		};

		await Promise.all(
			Array.from({ length: maxConcurrent }, () => worker()),
		);
		return results;
	};

	try {
		const xaiApiKey = getEnv("XAI_API_KEY");
			if (!xaiApiKey) {
				throw new Error("Missing XAI_API_KEY");
			}
			const xai = createXai({ apiKey: xaiApiKey });
			return await classifyInParallel(xai(XAI_MODEL_ID), "xAI classification");
		} catch (error) {
			errors.push(`xAI failed: ${(error as Error).message}`);
		}

	try {
		const openAiApiKey = getEnv("OPENAI_API_KEY");
			if (!openAiApiKey) {
				throw new Error("Missing OPENAI_API_KEY");
			}
			const openai = createOpenAI({ apiKey: openAiApiKey });
			return await classifyInParallel(
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
