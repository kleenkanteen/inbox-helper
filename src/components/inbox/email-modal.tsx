import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

type EmailModalProps = {
	isOpen: boolean;
	title: string;
	onClose: () => void;
	children: ReactNode;
	bodyClassName?: string;
};

export function EmailModal({
	isOpen,
	title,
	onClose,
	children,
	bodyClassName,
}: EmailModalProps) {
	if (!isOpen) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-3 sm:p-6">
			<div className="h-[88vh] w-[95vw] overflow-hidden rounded-lg border bg-white shadow-xl md:w-1/2">
				<div className="flex items-center justify-between border-b px-4 py-3">
					<h2 className="font-semibold text-base">{title}</h2>
					<button
						className="cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
						onClick={onClose}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div
					className={cn(
						"flex h-[calc(100%-53px)] min-h-0 flex-col",
						bodyClassName,
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
