import { useCallback, useState } from "react";
import {
	getMessageDetail,
	searchEmails,
} from "#/components/inbox/lib/inbox-api";
import type {
	ChatResultItem,
	MessageDetailResponse,
} from "#/components/inbox/types/inbox-types";

export const useChatPane = () => {
	const [isChatOpen, setIsChatOpen] = useState(false);
	const [chatQuery, setChatQuery] = useState("");
	const [chatLoading, setChatLoading] = useState(false);
	const [chatError, setChatError] = useState<string | null>(null);
	const [chatResults, setChatResults] = useState<ChatResultItem[]>([]);
	const [selectedChatEmail, setSelectedChatEmail] =
		useState<ChatResultItem | null>(null);
	const [messageDetail, setMessageDetail] =
		useState<MessageDetailResponse | null>(null);
	const [messageLoading, setMessageLoading] = useState(false);
	const [messageError, setMessageError] = useState<string | null>(null);

	const openChat = useCallback(() => {
		setIsChatOpen(true);
	}, []);

	const closeChat = useCallback(() => {
		setIsChatOpen(false);
		setChatError(null);
		setMessageError(null);
		setMessageDetail(null);
		setSelectedChatEmail(null);
	}, []);

	const searchChat = useCallback(async () => {
		const query = chatQuery.trim();
		if (query.length < 2) {
			setChatError("Please enter at least 2 characters.");
			return;
		}

		setChatLoading(true);
		setChatError(null);
		setMessageError(null);
		setMessageDetail(null);
		setSelectedChatEmail(null);
		try {
			const { ok, payload } = await searchEmails(query);
			if (!ok) {
				setChatError(payload.error ?? "Failed to search emails");
				setChatResults([]);
				return;
			}
			setChatResults(Array.isArray(payload.results) ? payload.results : []);
		} catch {
			setChatError("Failed to search emails");
			setChatResults([]);
		} finally {
			setChatLoading(false);
		}
	}, [chatQuery]);

	const loadMessageDetail = useCallback(async (email: ChatResultItem) => {
		setSelectedChatEmail(email);
		setMessageLoading(true);
		setMessageError(null);
		setMessageDetail(null);
		try {
			const { ok, payload } = await getMessageDetail(email.id);
			if (!ok) {
				setMessageError(payload.error ?? "Failed to load email");
				return;
			}
			setMessageDetail(payload);
		} catch {
			setMessageError("Failed to load email");
		} finally {
			setMessageLoading(false);
		}
	}, []);

	const backToResults = useCallback(() => {
		setSelectedChatEmail(null);
		setMessageDetail(null);
		setMessageError(null);
	}, []);

	return {
		isChatOpen,
		chatQuery,
		chatLoading,
		chatError,
		chatResults,
		selectedChatEmail,
		messageDetail,
		messageLoading,
		messageError,
		setChatQuery,
		openChat,
		closeChat,
		searchChat,
		loadMessageDetail,
		backToResults,
	};
};
