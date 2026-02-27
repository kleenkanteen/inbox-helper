import { Settings2 } from "lucide-react";
import { bucketIcon } from "#/components/inbox/lib/inbox-utils";
import type {
	BucketDefinition,
	GroupedBucket,
} from "#/components/inbox/types/inbox-types";

type CategoryPaneProps = {
	orderedBuckets: BucketDefinition[];
	groupedByBucketId: Map<string, GroupedBucket>;
	selectedBucketId: string | null;
	showConfigure: boolean;
	onSelectBucket: (bucketId: string) => void;
	onOpenConfigure: () => void;
};

export function CategoryPane({
	orderedBuckets,
	groupedByBucketId,
	selectedBucketId,
	showConfigure,
	onSelectBucket,
	onOpenConfigure,
}: CategoryPaneProps) {
	return (
		<aside className="rounded-lg border bg-white p-4 lg:col-span-1">
			<h2 className="mb-3 font-semibold text-base">Categories</h2>
			<div className="flex flex-col gap-1">
				{orderedBuckets.map((bucket) => {
					const Icon = bucketIcon(bucket);
					const count = groupedByBucketId.get(bucket.id)?.threads.length ?? 0;
					const isSelected = !showConfigure && selectedBucketId === bucket.id;

					return (
						<button
							className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
								isSelected ? "bg-slate-900 text-white" : "hover:bg-slate-100"
							}`}
							key={bucket.id}
							onClick={() => onSelectBucket(bucket.id)}
							type="button"
						>
							<span className="flex items-center gap-2">
								<Icon className="h-4 w-4" />
								{bucket.name}
							</span>
							<span
								className={`rounded-full px-2 py-0.5 text-xs ${
									isSelected ? "bg-white/20" : "bg-slate-100"
								}`}
							>
								{count}
							</span>
						</button>
					);
				})}

				<button
					className={`mt-2 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
						showConfigure ? "bg-slate-900 text-white" : "hover:bg-slate-100"
					}`}
					onClick={onOpenConfigure}
					type="button"
				>
					<Settings2 className="h-4 w-4" />
					Configure categories
				</button>
			</div>
		</aside>
	);
}
