import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";

type BucketDefinition = {
	id: string;
	name: string;
	type: "default" | "custom";
	description?: string;
};

type BucketedThread = {
	id: string;
	subject: string;
	snippet: string;
	confidence: number;
};

type GroupedBucket = {
	bucket: BucketDefinition;
	threads: BucketedThread[];
};

type InboxResponse = {
	buckets: BucketDefinition[];
	grouped: GroupedBucket[];
	needsGoogleAuth?: boolean;
	error?: string;
};

const buttonClass =
	"rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60";

export default function Home() {
	const [data, setData] = useState<InboxResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [bucketName, setBucketName] = useState("");
	const [bucketDescription, setBucketDescription] = useState("");

	const loadThreads = useCallback(async () => {
		setLoading(true);
		setError(null);
		const response = await fetch("/api/threads?limit=200", {
			method: "GET",
			cache: "no-store",
		});
		const payload = (await response.json()) as InboxResponse;
		if (!response.ok) {
			setData(payload);
			setError(payload.error ?? "Failed to load inbox");
			setLoading(false);
			return;
		}
		setData(payload);
		setLoading(false);
	}, []);

	useEffect(() => {
		void loadThreads();
	}, [loadThreads]);

	const connectGoogle = useCallback(async () => {
		setError(null);
		const response = await fetch("/api/auth/google/start", { method: "POST" });
		const payload = (await response.json()) as { url?: string; error?: string };
		if (!response.ok || !payload.url) {
			setError(payload.error ?? "Failed to start Google OAuth flow");
			return;
		}
		window.location.href = payload.url;
	}, []);

	const addBucket = useCallback(async () => {
		if (!bucketName.trim()) {
			setError("Bucket name is required");
			return;
		}
		setError(null);
		const response = await fetch("/api/buckets", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: bucketName.trim(),
				description: bucketDescription.trim() || undefined,
			}),
		});
		const payload = (await response.json()) as InboxResponse & {
			error?: unknown;
		};
		if (!response.ok) {
			setError("Failed to add bucket");
			return;
		}
		setData(payload);
		setBucketName("");
		setBucketDescription("");
	}, [bucketDescription, bucketName]);

	const recategorize = useCallback(async () => {
		setError(null);
		const response = await fetch("/api/classify", { method: "POST" });
		const payload = (await response.json()) as InboxResponse;
		if (!response.ok) {
			setError(payload.error ?? "Failed to recategorize threads");
			return;
		}
		setData(payload);
	}, []);

	const totalThreads = useMemo(
		() =>
			data?.grouped?.reduce((count, group) => count + group.threads.length, 0) ??
			0,
		[data],
	);

	return (
		<>
			<Head>
				<title>Inbox Helper</title>
				<meta
					content="LLM-powered Gmail bucket categorization"
					name="description"
				/>
				<link href="/favicon.ico" rel="icon" />
			</Head>
			<main className="min-h-screen bg-slate-100 text-slate-900">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
					<header className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h1 className="font-bold text-3xl">Eagle Eye</h1>
						</div>
					<div className="flex gap-2">
						<button
							className={buttonClass}
							onClick={() => void connectGoogle()}
							type="button"
						>
							Connect Gmail
						</button>
						<button
							className={buttonClass}
							onClick={() => void loadThreads()}
							type="button"
						>
								Refresh
							</button>
							<button
								className={buttonClass}
								onClick={() => void recategorize()}
								type="button"
							>
								Recategorize
							</button>
						</div>
					</header>

					<section className="rounded-lg border bg-white p-4">
						<div className="flex flex-wrap items-end gap-3">
							<div className="flex min-w-52 flex-1 flex-col gap-1">
								<label className="text-sm" htmlFor="bucket-name">
									Custom bucket name
								</label>
								<input
									className="rounded-md border px-3 py-2"
									id="bucket-name"
									onChange={(event) => setBucketName(event.target.value)}
									placeholder="Eg. Follow Up"
									value={bucketName}
								/>
							</div>
							<div className="flex min-w-52 flex-1 flex-col gap-1">
								<label className="text-sm" htmlFor="bucket-description">
									Description (optional)
								</label>
								<input
									className="rounded-md border px-3 py-2"
									id="bucket-description"
									onChange={(event) => setBucketDescription(event.target.value)}
									placeholder="Emails that need a response this week"
									value={bucketDescription}
								/>
							</div>
							<button
								className={buttonClass}
								onClick={() => void addBucket()}
								type="button"
							>
								Create bucket
							</button>
						</div>
					</section>

					{loading ? <p>Loading inbox...</p> : null}
					{error ? <p className="text-red-600 text-sm">{error}</p> : null}

					{data?.needsGoogleAuth ? (
						<section className="rounded-lg border bg-white p-5">
							<p className="mb-3 text-slate-700 text-sm">
								Connect your Google Workspace account to grant Gmail access.
							</p>
							<button
								className={buttonClass}
								onClick={() => void connectGoogle()}
								type="button"
							>
								Connect Google Account
							</button>
						</section>
					) : null}

					{data && !data.needsGoogleAuth ? (
						<section className="flex flex-col gap-3">
							<p className="text-slate-600 text-sm">
								{totalThreads} threads classified
							</p>
							<div className="grid gap-4 md:grid-cols-2">
								{data.grouped?.map((group) => (
									<article
										className="rounded-lg border bg-white p-4"
										key={group.bucket.id}
									>
										<div className="mb-3 flex items-center justify-between">
											<h2 className="font-semibold text-lg">
												{group.bucket.name}
											</h2>
											<span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
												{group.threads.length}
											</span>
										</div>
										<ul className="space-y-3">
											{group.threads.map((thread) => (
												<li
													className="border-b pb-2 last:border-b-0"
													key={thread.id}
												>
													<p className="truncate font-medium text-sm">
														{thread.subject}
													</p>
													<p className="line-clamp-2 text-slate-600 text-xs">
														{thread.snippet}
													</p>
												</li>
											))}
											{group.threads.length === 0 ? (
												<li className="text-slate-500 text-xs">
													No threads in this bucket
												</li>
											) : null}
										</ul>
									</article>
								))}
							</div>
						</section>
					) : null}
				</div>
			</main>
		</>
	);
}
