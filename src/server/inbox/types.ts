export type DefaultBucket =
	| "Important"
	| "Can Wait"
	| "Auto-Archive"
	| "Newsletter";

export type BucketType = "default" | "custom";

export type BucketDefinition = {
	id: string;
	name: string;
	type: BucketType;
	description?: string;
};

export type ThreadSummary = {
	id: string;
	subject: string;
	snippet: string;
	sender?: string;
};

export type ThreadClassification = {
	threadId: string;
	bucketId: string;
	confidence: number;
	reason?: string;
};

export type BucketedThreads = {
	bucket: BucketDefinition;
	threads: Array<ThreadSummary & { confidence: number }>;
};

export type GoogleOAuthToken = {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
	scope?: string;
	tokenType?: string;
};
