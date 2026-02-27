import { LogOut, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { buttonClass } from "#/components/inbox/lib/inbox-constants";

type InboxHeaderProps = {
	showSignInButton: boolean;
	onConnectGoogle: () => void;
	onOpenChat: () => void;
	onRefresh: () => void;
	onRecategorize: () => void;
	onLogout: () => void;
};

export function InboxHeader({
	showSignInButton,
	onConnectGoogle,
	onOpenChat,
	onRefresh,
	onRecategorize,
	onLogout,
}: InboxHeaderProps) {
	return (
		<header className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 className="font-bold text-3xl">Eagle Eye</h1>
			</div>
			<div className="flex gap-2">
				{showSignInButton ? (
					<button
						className={buttonClass}
						onClick={onConnectGoogle}
						type="button"
					>
						Sign in
					</button>
				) : null}
				<button className={buttonClass} onClick={onOpenChat} type="button">
					<MessageCircle className="mr-2 inline h-4 w-4" />
					Chat
				</button>
				<button className={buttonClass} onClick={onRefresh} type="button">
					<RefreshCw className="mr-2 inline h-4 w-4" />
					Refresh
				</button>
				<button className={buttonClass} onClick={onRecategorize} type="button">
					<Sparkles className="mr-2 inline h-4 w-4" />
					Recategorize
				</button>
				<button className={buttonClass} onClick={onLogout} type="button">
					<LogOut className="mr-2 inline h-4 w-4" />
					Logout
				</button>
			</div>
		</header>
	);
}
