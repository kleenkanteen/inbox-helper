import { ArrowLeft } from "lucide-react";
import { EmailModal } from "#/components/inbox/email-modal";
import { EmailViewer } from "#/components/inbox/email-viewer";
import { buttonClass } from "#/components/inbox/lib/inbox-constants";
import { formatThreadDate } from "#/components/inbox/lib/inbox-utils";
import type {
	ChatResultItem,
	MessageDetailResponse,
} from "#/components/inbox/types/inbox-types";

type ChatPaneProps = {
	isOpen: boolean;
	onClose: () => void;
	chatQuery: string;
	onChatQueryChange: (value: string) => void;
	onSearch: () => void;
	chatLoading: boolean;
	chatError: string | null;
	chatResults: ChatResultItem[];
	selectedChatEmail: ChatResultItem | null;
	onSelectEmail: (email: ChatResultItem) => void;
	onBackToResults: () => void;
	messageDetail: MessageDetailResponse | null;
	messageLoading: boolean;
	messageError: string | null;
};

export function ChatPane({
	isOpen,
	onClose,
	chatQuery,
	onChatQueryChange,
	onSearch,
	chatLoading,
	chatError,
	chatResults,
	selectedChatEmail,
	onSelectEmail,
	onBackToResults,
	messageDetail,
	messageLoading,
	messageError,
}: ChatPaneProps) {
	return (
		<EmailModal
			bodyClassName="flex min-h-0 flex-col"
			isOpen={isOpen}
			onClose={onClose}
			title="Chat"
		>
			<div className="space-y-3 border-b p-4">
				<p className="text-slate-600 text-sm">
					Find relevant emails using natural language
				</p>
				<div className="flex gap-2">
					<input
						className="w-full rounded-md border px-3 py-2 text-sm"
						onChange={(event) => onChatQueryChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								onSearch();
							}
						}}
						placeholder='Try "show me emails from sabih"'
						value={chatQuery}
					/>
					<button
						className={buttonClass}
						disabled={chatLoading}
						onClick={onSearch}
						type="button"
					>
						{chatLoading ? "Searching..." : "Search"}
					</button>
				</div>
				{chatError ? <p className="text-red-600 text-xs">{chatError}</p> : null}
			</div>
			<div className="flex-1 overflow-y-auto p-4">
				{selectedChatEmail ? (
					<div className="flex h-full min-h-0 flex-col gap-3">
						<button
							className="inline-flex cursor-pointer items-center gap-1 text-slate-600 text-xs hover:text-slate-900"
							onClick={onBackToResults}
							type="button"
						>
							<ArrowLeft className="h-3.5 w-3.5" />
							Back to results
						</button>
						<EmailViewer
							error={messageError}
							fallbackFrom={selectedChatEmail.sender}
							fallbackSubject={selectedChatEmail.subject}
							loading={messageLoading}
							messageDetail={messageDetail}
						/>
					</div>
				) : (
					<ul className="space-y-3">
						{chatResults.map((email) => (
							<li key={email.id}>
								<button
									className="w-full cursor-pointer rounded-md border p-3 text-left hover:bg-slate-50"
									onClick={() => onSelectEmail(email)}
									type="button"
								>
									<div className="flex items-start justify-between gap-2">
										<p className="whitespace-normal wrap-break-word font-medium text-sm">
											{email.subject}
										</p>
										{typeof email.receivedAt === "number" ? (
											<p className="shrink-0 text-slate-500 text-xs">
												{formatThreadDate(email.receivedAt)}
											</p>
										) : null}
									</div>
									{email.sender ? (
										<p className="mt-0.5 whitespace-normal wrap-break-word text-slate-500 text-xs">
											{email.sender}
										</p>
									) : null}
									<p className="mt-1 whitespace-normal wrap-break-word text-slate-600 text-sm">
										{email.snippet}
									</p>
								</button>
							</li>
						))}
						{!chatLoading && chatResults.length === 0 ? (
							<li className="text-slate-500 text-sm">
								Run a search to see matching emails.
							</li>
						) : null}
					</ul>
				)}
			</div>
		</EmailModal>
	);
}
