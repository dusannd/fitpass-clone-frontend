import { useState } from "react";

interface RefreshButtonProps {
    // Usually a query's refetch(). Awaited so the icon keeps turning until the data
    // is actually back.
    onRefresh: () => Promise<unknown>;
    // Read by screen readers and shown as the tooltip, e.g. "Refresh the schedule".
    label: string;
    className?: string;
}

// A request on localhost answers in ~30ms, which would make the icon twitch rather
// than turn. Holding the spin for at least one full rotation (animate-spin is 1s per
// turn) is what makes the click read as "yes, it refreshed".
const MIN_SPIN_MS = 600;

/**
 * A round reload button in the style of the browser's own - an arrow that spins while
 * the data is being fetched.
 *
 * Pages refresh on demand instead of polling: nothing here asks the server anything
 * unless somebody is looking at the screen and wants it.
 */
export default function RefreshButton({ onRefresh, label, className = "" }: RefreshButtonProps) {
    const [busy, setBusy] = useState(false);

    const handleClick = async () => {
        setBusy(true);
        try {
            await Promise.all([
                // A failed refresh shows up in the query's own error state, so the
                // button only has to stop spinning.
                onRefresh().catch(() => undefined),
                new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS)),
            ]);
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={() => void handleClick()}
            disabled={busy}
            aria-label={label}
            aria-busy={busy}
            title={label}
            className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default transition-colors ${className}`}
        >
            <svg
                viewBox="0 0 24 24"
                className={`h-5 w-5 ${busy ? "animate-spin motion-reduce:animate-pulse text-blue-600 dark:text-blue-400" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                {/* An open circle with an arrowhead at the top right, like Chrome's reload. */}
                <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                <path d="M20 4v7h-7" />
            </svg>
        </button>
    );
}
