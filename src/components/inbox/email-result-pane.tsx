import { CategoryConfigPane } from "#/components/inbox/category-config-pane";
import { ThreadListPane } from "#/components/inbox/thread-list-pane";
import type {
	BucketDefinition,
	BucketedThread,
	CategoryDraft,
	GroupedBucket,
} from "#/components/inbox/types/inbox-types";

type EmailResultPaneProps = {
	showConfigure: boolean;
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
	selectedGroup: GroupedBucket | null;
	onOpenThread: (thread: BucketedThread) => void;
};

export function EmailResultPane({
	showConfigure,
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
	selectedGroup,
	onOpenThread,
}: EmailResultPaneProps) {
	return (
		<div className="rounded-lg border bg-white p-4 lg:col-span-3">
			{showConfigure ? (
				<CategoryConfigPane
					categoryActionKey={categoryActionKey}
					categoryDrafts={categoryDrafts}
					newBucketDescription={newBucketDescription}
					newBucketName={newBucketName}
					onCreateCategory={onCreateCategory}
					onDeleteCategory={onDeleteCategory}
					onDraftChange={onDraftChange}
					onNewBucketDescriptionChange={onNewBucketDescriptionChange}
					onNewBucketNameChange={onNewBucketNameChange}
					onUpdateCategory={onUpdateCategory}
					orderedBuckets={orderedBuckets}
				/>
			) : (
				<ThreadListPane
					onOpenThread={onOpenThread}
					selectedGroup={selectedGroup}
				/>
			)}
		</div>
	);
}
