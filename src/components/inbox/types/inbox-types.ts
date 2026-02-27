export type BucketDefinition = {
	id: string;
	name: string;
	type: "default" | "custom";
	description?: string;
};

export type BucketedThread = {
	id: string;
	subject: string;
	snippet: string;
	receivedAt?: number;
	confidence: number;
};

export type GroupedBucket = {
	bucket: BucketDefinition;
	threads: BucketedThread[];
};

export type InboxResponse = {
	buckets: BucketDefinition[];
	grouped: GroupedBucket[];
	needsGoogleAuth?: boolean;
	error?: string;
};

export type CheckNewResponse = {
	hasNew: boolean;
	latestIds: string[];
	needsGoogleAuth?: boolean;
	error?: string;
};

export type ChatResultItem = {
	id: string;
	subject: string;
	snippet: string;
	sender?: string;
	receivedAt?: number;
};

export type ChatSearchResponse = {
	query: string;
	totalCandidates: number;
	results: ChatResultItem[];
	error?: string;
	needsGoogleAuth?: boolean;
};

export type MessageDetailResponse = {
	id: string;
	subject?: string;
	from?: string;
	to?: string;
	date?: string;
	html: string;
	error?: string;
	needsGoogleAuth?: boolean;
};

export type CategoryDraft = {
	name: string;
	description: string;
};
