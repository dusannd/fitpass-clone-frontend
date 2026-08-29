import { useEffect, useId, useRef } from "react";

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    // "danger" for anything that destroys or revokes something, "primary" for a
    // reversible choice the user is merely being asked to confirm.
    variant?: "danger" | "primary";
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * The app's replacement for window.confirm().
 *
 * The native dialog was the only surface left that ignored dark mode, could not be
 * styled and, on some browsers, blocks the whole tab. This renders in the same
 * visual language as SessionDetailModal and LiveWorkoutModal, and closes on Escape
 * or a backdrop click like both of them.
 */
export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "danger",
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    // Screen readers need to be told which nodes hold the title and the body. The
    // ids have to be unique per instance, hence useId rather than a constant.
    const titleId = useId();
    const messageId = useId();

    const confirmRef = useRef<HTMLButtonElement>(null);

    // --- 1. ESCAPE CLOSES ---
    // Same shape as SessionDetailModal. The listener only exists while the dialog
    // is open, so a closed modal never eats an Escape meant for something else.
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onCancel]);

    // --- 2. FOCUS THE CONFIRM BUTTON ---
    // Without this the focus ring stays on whatever opened the dialog, which is now
    // behind a backdrop - so a keyboard user would have to tab their way in blind.
    useEffect(() => {
        if (isOpen) confirmRef.current?.focus();
    }, [isOpen]);

    if (!isOpen) return null;

    const confirmClasses =
        variant === "danger"
            ? "bg-rose-600 hover:bg-rose-700 focus-visible:outline-rose-600"
            : "bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel}></div>

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={messageId}
                className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/20 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl animate-menu-pop"
            >
                <div className="p-6 flex flex-col gap-2">
                    <h2 id={titleId} className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                        {title}
                    </h2>
                    <p id={messageId} className="text-sm text-gray-600 dark:text-gray-400">
                        {message}
                    </p>
                </div>

                {/* Cancel sits first in the DOM but second on screen, so Escape and a
                    stray Enter both land on the safe choice while the eye still reads
                    the destructive button on the right where the app puts primaries. */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200/70 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/40">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        {cancelText}
                    </button>

                    <button
                        ref={confirmRef}
                        type="button"
                        onClick={onConfirm}
                        className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors ${confirmClasses}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
