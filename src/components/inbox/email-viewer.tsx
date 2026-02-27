import { buildMessageSrcDoc } from "#/components/inbox/lib/inbox-utils";
import type { MessageDetailResponse } from "#/components/inbox/types/inbox-types";

type EmailViewerProps = {
	fallbackSubject: string;
	fallbackFrom?: string;
	messageDetail: MessageDetailResponse | null;
	loading: boolean;
	error: string | null;
	emptyMessage?: string;
};

export function EmailViewer({
	fallbackSubject,
	fallbackFrom,
	messageDetail,
	loading,
	error,
	emptyMessage = "No email content available.",
}: EmailViewerProps) {
	return (
		<>
			<div>
				<p className="whitespace-normal wrap-break-word font-medium text-sm">
					{messageDetail?.subject ?? fallbackSubject}
				</p>
				{messageDetail?.from ? (
					<p className="whitespace-normal wrap-break-word text-slate-500 text-xs">
						{messageDetail.from}
					</p>
				) : fallbackFrom ? (
					<p className="whitespace-normal wrap-break-word text-slate-500 text-xs">
						{fallbackFrom}
					</p>
				) : null}
			</div>
			{loading ? (
				<p className="text-slate-500 text-sm">Loading email...</p>
			) : error ? (
				<p className="text-red-600 text-sm">{error}</p>
			) : messageDetail ? (
				<iframe
					className="h-full min-h-0 w-full flex-1 rounded-md border"
					sandbox=""
					srcDoc={buildMessageSrcDoc(messageDetail.html)}
					title={`message-${messageDetail.id}`}
				/>
			) : (
				<p className="text-slate-500 text-sm">{emptyMessage}</p>
			)}
		</>
	);
}
