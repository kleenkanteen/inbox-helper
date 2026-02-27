import { formatThreadDate } from "#/components/inbox/lib/inbox-utils";
import type {
	BucketedThread,
	GroupedBucket,
} from "#/components/inbox/types/inbox-types";

type ThreadListPaneProps = {
	selectedGroup: GroupedBucket | null;
	onOpenThread: (thread: BucketedThread) => void;
};

export function ThreadListPane({
	selectedGroup,
	onOpenThread,
}: ThreadListPaneProps) {
	if (!selectedGroup) {
		return (
			<p className="text-slate-500 text-sm">
				Select a category to view messages.
			</p>
		);
	}

	return (
		<>
			<div className="mb-3 flex items-center justify-between">
				<h3 className="font-semibold text-lg">{selectedGroup.bucket.name}</h3>
				<span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
					{selectedGroup.threads.length}
				</span>
			</div>
			<ul className="space-y-3">
				{selectedGroup.threads.map((thread) => (
					<li className="border-b pb-2 last:border-b-0" key={thread.id}>
						<button
							className="w-full cursor-pointer rounded-md p-2 text-left hover:bg-slate-50"
							onClick={() => onOpenThread(thread)}
							type="button"
						>
							<div className="flex items-start justify-between gap-2">
								<p className="truncate font-medium text-sm">{thread.subject}</p>
								{typeof thread.receivedAt === "number" ? (
									<p className="shrink-0 text-slate-500 text-xs">
										{formatThreadDate(thread.receivedAt)}
									</p>
								) : null}
							</div>
							<p
								className="mt-1 overflow-hidden text-slate-500 text-sm leading-5"
								style={{
									display: "-webkit-box",
									WebkitBoxOrient: "vertical",
									WebkitLineClamp: 2,
								}}
							>
								{thread.snippet}
							</p>
						</button>
					</li>
				))}
				{selectedGroup.threads.length === 0 ? (
					<li className="text-slate-500 text-xs">No threads in this bucket</li>
				) : null}
			</ul>
		</>
	);
}
