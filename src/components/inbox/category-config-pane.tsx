import { buttonClass } from "#/components/inbox/lib/inbox-constants";
import type {
	BucketDefinition,
	CategoryDraft,
} from "#/components/inbox/types/inbox-types";

type CategoryConfigPaneProps = {
	orderedBuckets: BucketDefinition[];
	newBucketName: string;
	newBucketDescription: string;
	categoryDrafts: Record<string, CategoryDraft>;
	categoryActionKey: string | null;
	onNewBucketNameChange: (value: string) => void;
	onNewBucketDescriptionChange: (value: string) => void;
	onCreateCategory: () => void;
	onDraftChange: (bucketId: string, draft: CategoryDraft) => void;
	onUpdateCategory: (bucket: BucketDefinition) => void;
	onDeleteCategory: (bucketId: string) => void;
};

export function CategoryConfigPane({
	orderedBuckets,
	newBucketName,
	newBucketDescription,
	categoryDrafts,
	categoryActionKey,
	onNewBucketNameChange,
	onNewBucketDescriptionChange,
	onCreateCategory,
	onDraftChange,
	onUpdateCategory,
	onDeleteCategory,
}: CategoryConfigPaneProps) {
	return (
		<div className="space-y-3">
			<h3 className="font-semibold text-lg">Configure categories</h3>
			<div className="flex flex-col gap-1">
				<label className="text-sm" htmlFor="category-name">
					Category name
				</label>
				<input
					className="rounded-md border px-3 py-2"
					id="category-name"
					onChange={(event) => onNewBucketNameChange(event.target.value)}
					placeholder="Eg. Follow Up"
					value={newBucketName}
				/>
			</div>
			<div className="flex flex-col gap-1">
				<label className="text-sm" htmlFor="category-description">
					Description
				</label>
				<input
					className="rounded-md border px-3 py-2"
					id="category-description"
					onChange={(event) => onNewBucketDescriptionChange(event.target.value)}
					placeholder="Emails that need follow-up"
					value={newBucketDescription}
				/>
			</div>
			<button
				className={buttonClass}
				disabled={categoryActionKey !== null}
				onClick={onCreateCategory}
				type="button"
			>
				{categoryActionKey === "create" ? "Creating..." : "Create category"}
			</button>

			<div className="pt-2">
				<h4 className="mb-2 font-medium text-sm">Existing categories</h4>
				<ul className="space-y-3">
					{orderedBuckets.map((bucket) => {
						const draft = categoryDrafts[bucket.id] ?? {
							name: bucket.name,
							description: bucket.description ?? "",
						};
						const saveKey = `save-${bucket.id}`;
						const deleteKey = `delete-${bucket.id}`;

						return (
							<li className="rounded-md border p-3" key={bucket.id}>
								<div className="space-y-2">
									<div className="flex flex-col gap-1">
										<label
											className="text-xs"
											htmlFor={`bucket-name-${bucket.id}`}
										>
											Name
										</label>
										<input
											className="rounded-md border px-2 py-1.5 text-sm"
											id={`bucket-name-${bucket.id}`}
											onChange={(event) =>
												onDraftChange(bucket.id, {
													...draft,
													name: event.target.value,
												})
											}
											value={draft.name}
										/>
									</div>
									<div className="flex flex-col gap-1">
										<label
											className="text-xs"
											htmlFor={`bucket-description-${bucket.id}`}
										>
											Description
										</label>
										<input
											className="rounded-md border px-2 py-1.5 text-sm"
											id={`bucket-description-${bucket.id}`}
											onChange={(event) =>
												onDraftChange(bucket.id, {
													...draft,
													description: event.target.value,
												})
											}
											value={draft.description}
										/>
									</div>
									<div className="flex gap-2">
										<button
											className={buttonClass}
											disabled={categoryActionKey !== null}
											onClick={() => onUpdateCategory(bucket)}
											type="button"
										>
											{categoryActionKey === saveKey ? "Saving..." : "Save"}
										</button>
										<button
											className="cursor-pointer rounded-md border border-red-300 px-4 py-2 text-red-700 text-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
											disabled={categoryActionKey !== null}
											onClick={() => onDeleteCategory(bucket.id)}
											type="button"
										>
											{categoryActionKey === deleteKey
												? "Deleting..."
												: "Delete"}
										</button>
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}
