import { useEffect } from "react";

type UseEscapeCloseOptions = {
	isChatOpen: boolean;
	isCategoryMessageOpen: boolean;
	onCloseChat: () => void;
	onCloseCategoryMessage: () => void;
};

export const useEscapeClose = ({
	isChatOpen,
	isCategoryMessageOpen,
	onCloseChat,
	onCloseCategoryMessage,
}: UseEscapeCloseOptions) => {
	useEffect(() => {
		if (!isChatOpen && !isCategoryMessageOpen) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}
			if (isCategoryMessageOpen) {
				onCloseCategoryMessage();
				return;
			}
			onCloseChat();
		};

		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [isCategoryMessageOpen, isChatOpen, onCloseCategoryMessage, onCloseChat]);
};
