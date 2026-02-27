import { CategoryMessagePane } from "#/components/inbox/category-message-pane";
import { CategoryPane } from "#/components/inbox/category-pane";
import { ChatPane } from "#/components/inbox/chat-pane";
import { EmailResultPane } from "#/components/inbox/email-result-pane";
import { useCategoryMessage } from "#/components/inbox/hooks/use-category-message";
import { useChatPane } from "#/components/inbox/hooks/use-chat-pane";
import { useEscapeClose } from "#/components/inbox/hooks/use-escape-close";
import { useInboxData } from "#/components/inbox/hooks/use-inbox-data";
import { InboxHeader } from "#/components/inbox/inbox-header";
import { buttonClass } from "#/components/inbox/lib/inbox-constants";
import { SpinnerBadge } from "#/components/spinner-badge";

export function InboxDashboard() {
	const inbox = useInboxData();
	const chat = useChatPane();
	const categoryMessage = useCategoryMessage();

	useEscapeClose({
		isChatOpen: chat.isChatOpen,
		isCategoryMessageOpen: categoryMessage.isCategoryMessageOpen,
		onCloseChat: chat.closeChat,
		onCloseCategoryMessage: categoryMessage.closeCategoryMessage,
	});

	if (inbox.loading && !inbox.data) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-900">
				<SpinnerBadge />
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-slate-100 text-slate-900">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
				<InboxHeader
					onConnectGoogle={() => void inbox.connectGoogle()}
					onLogout={() => void inbox.logout()}
					onOpenChat={chat.openChat}
					onRecategorize={() => void inbox.recategorize()}
					onRefresh={() => void inbox.refreshInbox()}
					showSignInButton={inbox.showSignInButton}
				/>

				{inbox.isUpdatingBadgeVisible ? (
					<div className="flex justify-center">
						<SpinnerBadge />
					</div>
				) : null}

				{inbox.error ? (
					<p className="text-red-600 text-sm">{inbox.error}</p>
				) : null}

				{inbox.data?.needsGoogleAuth && !inbox.isResolvingGoogleConnection ? (
					<section className="rounded-lg border bg-white p-5">
						<p className="mb-3 text-slate-700 text-sm">
							Connect your Google Workspace account to grant Gmail access.
						</p>
						<button
							className={buttonClass}
							onClick={() => void inbox.connectGoogle()}
							type="button"
						>
							Connect Google Account
						</button>
					</section>
				) : null}

				{inbox.data && !inbox.data.needsGoogleAuth ? (
					<section className="grid gap-4 lg:grid-cols-4">
						<CategoryPane
							groupedByBucketId={inbox.groupedByBucketId}
							onOpenConfigure={inbox.openConfigure}
							onSelectBucket={inbox.selectBucket}
							orderedBuckets={inbox.orderedBuckets}
							selectedBucketId={inbox.selectedBucketId}
							showConfigure={inbox.showConfigure}
						/>
						<EmailResultPane
							categoryActionKey={inbox.categoryActionKey}
							categoryDrafts={inbox.categoryDrafts}
							newBucketDescription={inbox.newBucketDescription}
							newBucketName={inbox.newBucketName}
							onCreateCategory={() => void inbox.createCategory()}
							onDeleteCategory={(bucketId) =>
								void inbox.deleteCategoryById(bucketId)
							}
							onDraftChange={inbox.setCategoryDraft}
							onNewBucketDescriptionChange={inbox.setNewBucketDescription}
							onNewBucketNameChange={inbox.setNewBucketName}
							onOpenThread={(thread) =>
								void categoryMessage.openCategoryMessage(thread)
							}
							onUpdateCategory={(bucket) => void inbox.updateCategory(bucket)}
							orderedBuckets={inbox.orderedBuckets}
							selectedGroup={inbox.selectedGroup}
							showConfigure={inbox.showConfigure}
						/>
					</section>
				) : null}
			</div>

			<ChatPane
				chatError={chat.chatError}
				chatLoading={chat.chatLoading}
				chatQuery={chat.chatQuery}
				chatResults={chat.chatResults}
				isOpen={chat.isChatOpen}
				messageDetail={chat.messageDetail}
				messageError={chat.messageError}
				messageLoading={chat.messageLoading}
				onBackToResults={chat.backToResults}
				onChatQueryChange={chat.setChatQuery}
				onClose={chat.closeChat}
				onSearch={() => void chat.searchChat()}
				onSelectEmail={(email) => void chat.loadMessageDetail(email)}
				selectedChatEmail={chat.selectedChatEmail}
			/>

			<CategoryMessagePane
				error={categoryMessage.categoryMessageError}
				isOpen={categoryMessage.isCategoryMessageOpen}
				loading={categoryMessage.categoryMessageLoading}
				messageDetail={categoryMessage.categoryMessageDetail}
				onClose={categoryMessage.closeCategoryMessage}
				selectedEmail={categoryMessage.selectedCategoryEmail}
			/>
		</main>
	);
}
