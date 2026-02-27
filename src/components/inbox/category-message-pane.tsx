import { EmailModal } from "#/components/inbox/email-modal";
import { EmailViewer } from "#/components/inbox/email-viewer";
import type {
	ChatResultItem,
	MessageDetailResponse,
} from "#/components/inbox/types/inbox-types";

type CategoryMessagePaneProps = {
	isOpen: boolean;
	onClose: () => void;
	selectedEmail: ChatResultItem | null;
	messageDetail: MessageDetailResponse | null;
	loading: boolean;
	error: string | null;
};

export function CategoryMessagePane({
	isOpen,
	onClose,
	selectedEmail,
	messageDetail,
	loading,
	error,
}: CategoryMessagePaneProps) {
	if (!selectedEmail) {
		return null;
	}

	return (
		<EmailModal isOpen={isOpen} onClose={onClose} title="Email">
			<div className="flex h-full min-h-0 flex-col gap-3 p-4">
				<EmailViewer
					error={error}
					fallbackSubject={selectedEmail.subject}
					loading={loading}
					messageDetail={messageDetail}
				/>
			</div>
		</EmailModal>
	);
}
