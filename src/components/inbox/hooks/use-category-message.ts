import { useCallback, useState } from "react";
import { getMessageDetail } from "#/components/inbox/lib/inbox-api";
import type {
	BucketedThread,
	ChatResultItem,
	MessageDetailResponse,
} from "#/components/inbox/types/inbox-types";

export const useCategoryMessage = () => {
	const [isCategoryMessageOpen, setIsCategoryMessageOpen] = useState(false);
	const [selectedCategoryEmail, setSelectedCategoryEmail] =
		useState<ChatResultItem | null>(null);
	const [categoryMessageDetail, setCategoryMessageDetail] =
		useState<MessageDetailResponse | null>(null);
	const [categoryMessageLoading, setCategoryMessageLoading] = useState(false);
	const [categoryMessageError, setCategoryMessageError] = useState<
		string | null
	>(null);

	const closeCategoryMessage = useCallback(() => {
		setIsCategoryMessageOpen(false);
		setSelectedCategoryEmail(null);
		setCategoryMessageDetail(null);
		setCategoryMessageError(null);
	}, []);

	const openCategoryMessage = useCallback(async (thread: BucketedThread) => {
		const email: ChatResultItem = {
			id: thread.id,
			subject: thread.subject,
			snippet: thread.snippet,
			receivedAt: thread.receivedAt,
		};
		setIsCategoryMessageOpen(true);
		setSelectedCategoryEmail(email);
		setCategoryMessageLoading(true);
		setCategoryMessageError(null);
		setCategoryMessageDetail(null);
		try {
			const { ok, payload } = await getMessageDetail(email.id);
			if (!ok) {
				setCategoryMessageError(payload.error ?? "Failed to load email");
				return;
			}
			setCategoryMessageDetail(payload);
		} catch {
			setCategoryMessageError("Failed to load email");
		} finally {
			setCategoryMessageLoading(false);
		}
	}, []);

	return {
		isCategoryMessageOpen,
		selectedCategoryEmail,
		categoryMessageDetail,
		categoryMessageLoading,
		categoryMessageError,
		closeCategoryMessage,
		openCategoryMessage,
	};
};
