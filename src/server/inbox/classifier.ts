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
const PREVIEW_LIMIT = 300;

const truncatePreview = (value: string) => value.slice(0, PREVIEW_LIMIT);

const classificationSchema = z.object({
	classifications: z.array(
		z.object({
			threadId: z.string(),
			bucketId: z.string(),
			confidence: z.number().min(0).max(1),
			reason: z.string().max(240).optional(),
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
		id: thread.id,
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
		prompt: `Classify every thread into exactly one bucket.\n\nBuckets:\n${JSON.stringify(bucketIndex)}\n\nThreads:\n${JSON.stringify(normalizedThreads)}\n\nReturn one classification per thread. bucketId must be one of the provided bucket ids.`,
	});

	const allowedBucketIds = new Set(buckets.map((bucket) => bucket.id));
	const byThreadId = new Map(
		object.classifications.map((classification) => [
			classification.threadId,
			classification,
		]),
	);

	return normalizedThreads.map((thread) => {
		const fromModel = byThreadId.get(thread.id);
		if (!fromModel) {
			throw new Error(`Missing classification for thread ${thread.id}`);
		}
		if (!allowedBucketIds.has(fromModel.bucketId)) {
			throw new Error(
				`Invalid bucketId '${fromModel.bucketId}' for thread ${thread.id}`,
			);
		}
		return {
			threadId: thread.id,
			bucketId: fromModel.bucketId,
			confidence: fromModel.confidence,
			reason: fromModel.reason,
		};
	});
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

	try {
		if (!env.XAI_API_KEY) {
			throw new Error("Missing XAI_API_KEY");
		}
		const xai = createXai({ apiKey: env.XAI_API_KEY });
		return await classifyWithModel({
			model: xai(XAI_MODEL_ID),
			threads: limited,
			buckets,
		});
	} catch (error) {
		errors.push(`xAI failed: ${(error as Error).message}`);
	}

	try {
		if (!env.OPENAI_API_KEY) {
			throw new Error("Missing OPENAI_API_KEY");
		}
		const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
		return await classifyWithModel({
			model: openai(OPENAI_MODEL_ID),
			threads: limited,
			buckets,
		});
	} catch (error) {
		errors.push(`OpenAI failed: ${(error as Error).message}`);
	}

	throw new Error(`LLM classification failed. ${errors.join(" | ")}`);
};
